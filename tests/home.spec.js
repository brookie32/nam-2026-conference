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

test.describe('My Agenda is a blank canvas', () => {
  test('it says it is coming soon, and is still in the nav', async ({ page }, testInfo) => {
    await visit(page, '/');
    // Desktop shows the main nav; a phone hides it behind the menu button.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
    }
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toContainText('Coming soon');

    await visit(page, '/my-plan');
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toBeVisible();
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
