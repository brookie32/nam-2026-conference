import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, laneFor, ATTENDEES, shotForPR } from './helpers.js';


test.describe('Home is a way in, not a feed', () => {
  test('it links to every main page, and each link lands', async ({ page }) => {
    await visit(page, '/');
    const links = page.getByTestId('quick-links').getByRole('link');
    await expect(links).toHaveCount(5);

    for (const [name, path] of [['Schedule', '/schedule'], ['Speakers', '/speakers'], ['Venues', '/venues'],
      ['Food & drink', '/food'], ['Expo', '/expo']]) {
      await expect(page.getByTestId('quick-links').getByRole('link', { name: new RegExp(`^${name}`) }))
        .toHaveAttribute('href', path);
    }
  });

  test('nothing live is on it; the one personal card is Up next', async ({ page }) => {
    // A speaker, mid-morning, with sessions booked: the case that used to fill the page.
    await visit(page, '/', { as: ATTENDEES.andy, at: await momentOn(0, '10:30') });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    for (const id of ['today-panel', 'live-now', 'speaking-strip', 'followed-sessions', 'next-up']) {
      await expect(page.getByTestId(id), `${id} should not be on home`).toHaveCount(0);
    }
  });

  test('no announcement appears before it was posted', async ({ page, request }) => {
    const days = await conferenceDays();
    const all = await (await request.get(`${API}/announcements`)).json();
    const cutoff = `${days[0]}T09:00:00Z`;
    const posted = all.filter((a) => a.postedAt <= cutoff);
    const future = all.filter((a) => a.postedAt > cutoff);
    expect(posted.length, 'nothing is posted before 09:00 on day 1').toBeGreaterThan(0);
    expect(future.length, 'nothing is posted after 09:00 on day 1').toBeGreaterThan(0);

    await visit(page, '/', { at: await momentOn(0, '09:00') });
    const strip = page.getByTestId('announcements');
    await expect(strip).toBeVisible();

    const shown = await strip.innerText();
    for (const a of future) {
      expect(shown, `"${a.title}" was posted later than the clock`).not.toContain(a.title);
    }
  });
});

test.describe('Happening now strip', () => {
  test('lists what /api/live returns, says so when nothing is live, carries the latest announcement, and fits a phone', async ({ page, request }, testInfo) => {
    const days = await conferenceDays();
    const live = async (time) =>
      (await request.get(`${API}/live?day=${days[0]}&time=${time}`)).json();
    const strip = page.getByTestId('happening-now');

    // Mid-session: exactly the API's sessions, in order, each linked.
    const mid = await live('10:30');
    expect(mid.happeningNow.length, 'something is running at 10:30 on day 1').toBeGreaterThan(0);
    await visit(page, '/', { at: await momentOn(0, '10:30') });
    const rows = strip.getByTestId('happening-now-session');
    await expect(rows).toHaveCount(mid.happeningNow.length);
    for (const [i, s] of mid.happeningNow.entries()) {
      await expect(rows.nth(i)).toContainText(s.title);
      await expect(rows.nth(i)).toContainText(s.room.name);
      await expect(rows.nth(i).getByRole('link')).toHaveAttribute('href', `/sessions/${s.id}`);
    }
    await expect(strip.getByTestId('happening-now-empty')).toHaveCount(0);

    // The latest announcement sits inside the strip, and only once.
    const all = await (await request.get(`${API}/announcements`)).json();
    const cutoff = `${days[0]}T10:30:00Z`;
    const expected = all
      .filter((a) => a.postedAt <= cutoff)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.localeCompare(a.postedAt))[0];
    await expect(strip.getByTestId('announcements')).toContainText(expected.title);
    await expect(page.getByTestId('announcements')).toHaveCount(1);

    await shotForPR(page, 'happening-now-strip');
    if (testInfo.project.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      // Reveal animates in, so poll until it settles.
      await expect.poll(async () => {
        const box = await strip.boundingBox();
        return box.x >= 0 && box.x + box.width <= page.viewportSize().width;
      }).toBe(true);
    }

    // Nothing live: before the first slot, between slots, and after the last.
    const schedule = `/schedule?day=${days[0]}`;
    const empty = strip.getByTestId('happening-now-empty');
    const before = await live('07:00');
    await visit(page, '/', { at: await momentOn(0, '07:00') });
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(`starts at ${before.dayStartsAt}`);
    await expect(empty.getByRole('link')).toHaveAttribute('href', schedule);
    await expect(rows).toHaveCount(0);

    let gap = null;
    for (let m = 8 * 60; m < 22 * 60 && !gap; m += 5) {
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const l = await live(t);
      if (!l.happeningNow.length && l.nextSlot && t > l.dayStartsAt) gap = l;
    }
    if (gap) {
      await visit(page, '/', { at: await momentOn(0, gap.time) });
      await expect(empty).toContainText(`next starts at ${gap.nextSlot}`);
      await expect(rows).toHaveCount(0);
    }

    const after = await live('23:00');
    await visit(page, '/', { at: await momentOn(0, '23:00') });
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('over');
    await expect(empty).not.toContainText(`starts at ${after.dayStartsAt}`);
    await expect(empty.getByRole('link')).toHaveAttribute('href', schedule);
    await expect(rows).toHaveCount(0);
  });
});

const getToday = async (request, user, day, time) =>
  (await request.get(`${API}/users/${user}/today?day=${day}&time=${time}`)).json();

test.describe('Up next for you', () => {
  test('shows the next session and when it starts, checks in inside the window, says so when the day is done, and follows the attendee', async ({ page, request }, testInfo) => {
    const days = await conferenceDays();
    const card = page.getByTestId('up-next');

    // Before the day: Jonas's next session, its room and venue, and a countdown. Nothing to check into yet.
    const jonas = (await getToday(request, ATTENDEES.jonas, days[0], '07:00')).next;
    await visit(page, '/', { as: ATTENDEES.jonas, at: await momentOn(0, '07:00') });
    await expect(page.getByTestId('up-next-session')).toContainText(jonas.title);
    await expect(card).toContainText(jonas.room.name);
    await expect(card).toContainText(jonas.venue.shortName);
    await expect(card).toContainText('in 1h 0m');
    await expect(page.getByTestId('up-next-checkin')).toHaveCount(0);
    await shotForPR(page, 'up-next-card');
    if (testInfo.project.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    // A session in progress is shown, not skipped; this one is already attended in the seed.
    await visit(page, '/', { as: ATTENDEES.jonas, at: await momentOn(0, '08:10') });
    await expect(page.getByTestId('up-next-session')).toContainText(jonas.title);
    await expect(card).toContainText('started 10 min ago');
    await expect(page.getByTestId('up-next-checked-in')).toBeVisible();
    await expect(page.getByTestId('up-next-checkin')).toHaveCount(0);

    // Switching attendee changes the card.
    const andy = (await getToday(request, ATTENDEES.andy, days[0], '07:00')).next;
    expect(andy.id).not.toBe(jonas.id);
    await visit(page, '/', { as: ATTENDEES.jonas, at: await momentOn(0, '07:00') });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByRole('option', { name: /Andy Vays/ }).click();
    await expect(page.getByTestId('up-next-session')).toContainText(andy.title);
    await expect(page.getByTestId('up-next-session')).not.toContainText(jonas.title);

    // Nothing left today: say so, and link to today's schedule.
    await visit(page, '/', { as: ATTENDEES.jonas, at: await momentOn(0, '23:00') });
    await expect(page.getByTestId('up-next-empty')).toBeVisible();
    await expect(page.getByTestId('up-next-empty').getByRole('link')).toHaveAttribute('href', `/schedule?day=${days[0]}`);
    await expect(page.getByTestId('up-next-session')).toHaveCount(0);

    // Check-in: closed 20 minutes before, open 10 minutes before, and the card reflects it once in.
    const { user, day } = await laneFor('home.up-next', testInfo);
    const plan = await (await request.get(`${API}/users/${user}/schedule`)).json();
    const me = await (await request.get(`${API}/users/${user}`)).json();
    const been = new Set(me.checkIns);
    const target = plan.days.find((d) => d.date === day).sessions
      .filter((s) => s.reservation === 'confirmed' && !been.has(s.id))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    expect(target, 'the lane attendee has a confirmed, unattended session on its day').toBeTruthy();
    const at = (mins) => {
      const m = Number(target.startsAt.slice(0, 2)) * 60 + Number(target.startsAt.slice(3)) - mins;
      return `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };

    await visit(page, '/', { as: user, at: at(20) });
    await expect(page.getByTestId('up-next-session')).toContainText(target.title);
    await expect(page.getByTestId('up-next-checkin')).toHaveCount(0);

    await visit(page, '/', { as: user, at: at(10) });
    await page.getByTestId('up-next-checkin').click();
    await expect(page.getByTestId('up-next-checked-in')).toBeVisible();
    await expect(page.getByTestId('up-next-checkin')).toHaveCount(0);
  });
});

test.describe('Rate it prompt', () => {
  test('offers the latest ended, checked-in, unrated session; rating it saves and moves on; nothing to rate shows nothing', async ({ page, request }, testInfo) => {
    const { user, day, slot } = await laneFor('home.rate-it', testInfo);
    const all = await (await request.get(`${API}/sessions?day=${day}`)).json();
    const me0 = await (await request.get(`${API}/users/${user}`)).json();
    const been = new Set(me0.checkIns ?? []);
    const target = all
      .filter((s) => !s.isKeynote && s.format !== 'Social' && !been.has(s.id) && s.startsAt === slot)
      .sort((a, b) => a.id - b.id)[0];
    expect(target, 'a session at the lane slot to attend').toBeTruthy();
    await request.put(`${API}/users/${user}/checkins/${target.id}`, { data: { day, time: target.startsAt } });

    const prompt = page.getByTestId('rate-it');
    const state = async () => {
      const me = await (await request.get(`${API}/users/${user}`)).json();
      const sessions = await (await request.get(`${API}/sessions`)).json();
      return { me, sessions };
    };
    const expectedAt = async (time) => {
      const { me, sessions } = await state();
      const rated = new Set(me.ratings.map((r) => r.sessionId));
      return sessions
        .filter((s) => me.checkIns.includes(s.id) && !rated.has(s.id)
          && (s.day < day || (s.day === day && s.endsAt <= time)))
        .sort((a, b) => (b.day.localeCompare(a.day)) || b.endsAt.localeCompare(a.endsAt) || b.id - a.id)[0];
    };

    // Before anything has ended on day 0: no prompt.
    await visit(page, '/', { as: user, at: `${day}T08:00` });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    await expect(prompt).toHaveCount(0);

    // Mid-session: the running session is not offered.
    const [h, m] = target.startsAt.split(':').map(Number);
    const mid = `${String(h).padStart(2, '0')}:${String(m + 5).padStart(2, '0')}`;
    await page.goto(`/?at=${day}T${mid}`);
    await expect(page.getByTestId('quick-links')).toBeVisible();
    await expect(page.getByTestId('rate-it-session').filter({ hasText: target.title })).toHaveCount(0);

    // After it ends: the expected session is shown.
    await page.goto(`/?at=${day}T${target.endsAt}`);
    const expected = await expectedAt(target.endsAt);
    await expect(page.getByTestId('rate-it-session')).toContainText(expected.title);
    await expect(prompt).toContainText(expected.room.name);

    // It fits the phone.
    const fit = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(fit.sw).toBeLessThanOrEqual(fit.cw);
    for (const n of [1, 5]) {
      const box = await prompt.getByRole('radio', { name: `${n} star${n > 1 ? 's' : ''}`, exact: true }).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(fit.cw);
    }
    await shotForPR(page, 'Rate it prompt on Home');

    // Rate it: saved, toasted, and the prompt moves on.
    await prompt.getByRole('radio', { name: '4 stars', exact: true }).click();
    await expect(page.getByTestId('toaster')).toContainText('Rating saved');
    const after = (await state()).me.ratings.find((r) => r.sessionId === expected.id);
    expect(after?.stars).toBe(4);
    await expect(page.getByTestId('rate-it-session').filter({ hasText: expected.title })).toHaveCount(0);

    // Clear whatever else is unrated: the prompt goes away.
    for (let i = 0; i < 20 && await prompt.count(); i++) {
      const next = await expectedAt(target.endsAt);
      await expect(page.getByTestId('rate-it-session')).toContainText(next.title);
      await prompt.getByRole('radio', { name: '3 stars', exact: true }).click();
      await expect(page.getByTestId('rate-it-session').filter({ hasText: next.title })).toHaveCount(0);
    }
    await expect(prompt).toHaveCount(0);
  });
});
