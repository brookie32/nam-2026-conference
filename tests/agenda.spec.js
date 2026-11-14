import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, laneFor, bookableFor, shotForPR, failOnPageErrors, ATTENDEES } from './helpers.js';

const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hoursText = (m) => `${+(m / 60).toFixed(1)}h`;

/** The confirmed session in progress at `time`, else the next to start — worked out from the payload. */
function expectedFocus(day, time) {
  const now = mins(time);
  const mine = day.sessions.filter((s) => s.reservation === 'confirmed').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return mine.find((s) => mins(s.startsAt) <= now && now < mins(s.endsAt)) ?? mine.find((s) => mins(s.startsAt) > now) ?? null;
}

test('My Agenda is in the nav and /my-plan lands on it', async ({ page }, testInfo) => {
  await visit(page, '/');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
  }
  await expect(page).toHaveURL(/\/my-agenda$/);
  await expect(page.getByTestId('agenda-coming-soon')).toHaveCount(0);
  await visit(page, '/my-plan');
  await expect(page).toHaveURL(/\/my-agenda$/);
});

test('your sessions by day, with waitlist, clash, removal, empty state and the focus row', async ({ page, request }, testInfo) => {
  const errors = failOnPageErrors(page);
  const days = await conferenceDays();

  // Read-only: Jonas's seeded plan, day by day, against the payload the page is built from.
  const plan = await (await request.get(`${API}/users/${ATTENDEES.jonas}/schedule`)).json();
  await visit(page, '/my-agenda', { at: await momentOn(0, '10:30') });
  const sections = page.getByTestId('agenda-day');
  await expect(sections).toHaveCount(plan.days.length);
  expect(await sections.first().getAttribute('data-date')).toBe(days[0]);
  for (const day of plan.days) {
    const section = page.locator(`[data-testid="agenda-day"][data-date="${day.date}"]`);
    await expect(section.getByTestId('agenda-day-hours')).toContainText(hoursText(day.totalMinutes));
    if (day.waitlistedMinutes > 0) {
      await expect(section.getByTestId('agenda-day-waitlisted')).toContainText(`+${hoursText(day.waitlistedMinutes)} waitlisted`);
    } else {
      await expect(section.getByTestId('agenda-day-waitlisted')).toHaveCount(0);
    }
    const ids = await section.getByTestId('agenda-row').evaluateAll((els) => els.map((e) => e.dataset.sessionId));
    const sorted = [...day.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    expect(ids, `rows on ${day.date} in start order`).toEqual(sorted.map((s) => String(s.id)).filter((id) => ids.includes(id)));
  }

  // The clock picks the highlighted row: in progress, then the day's first, and the pinned day comes first.
  const today = plan.days.find((d) => d.date === days[0]);
  await expect(page.getByTestId('agenda-focus')).toHaveAttribute('data-session-id', String(expectedFocus(today, '10:30').id));
  await visit(page, '/my-agenda', { at: await momentOn(0, '07:00') });
  await expect(page.getByTestId('agenda-focus')).toHaveAttribute('data-session-id', String(expectedFocus(today, '07:00').id));
  await visit(page, '/my-agenda', { at: await momentOn(1, '07:00') });
  await expect(sections.first()).toHaveAttribute('data-date', days[1]);

  // A lane attendee: waitlist a full session, take a confirmed seat in the same slot.
  const lane = await laneFor('agenda.page', testInfo);
  const open = await bookableFor(request, lane.user, lane.day);
  const full = open.find((s) => s.seatsLeft === 0 && s.startsAt === lane.slot);
  expect(full, 'a sold-out session with a clashing open one on this lane day').toBeTruthy();
  const clash = open.find((c) => c.id !== full.id && c.seatsLeft > 3 && c.startsAt < full.endsAt && full.startsAt < c.endsAt);
  const put = (id) => request.put(`${API}/users/${lane.user}/reservations/${id}`);
  const del = (id) => request.delete(`${API}/users/${lane.user}/reservations/${id}`);
  try {
    expect((await put(full.id)).ok()).toBeTruthy();
    expect((await put(clash.id)).ok()).toBeTruthy();
    const seat = await (await request.get(`${API}/users/${lane.user}/reservations/${full.id}`)).json();
    expect(seat.status).toBe('waitlisted');

    await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(0, '08:00') });
    const mine = page.locator(`[data-testid="agenda-day"][data-date="${lane.day}"]`);
    const waitRow = mine.locator(`[data-testid="agenda-row"][data-session-id="${full.id}"]`);
    const seatRow = mine.locator(`[data-testid="agenda-row"][data-session-id="${clash.id}"]`);
    await expect(waitRow.getByTestId('agenda-position')).toHaveText(`Position ${seat.waitlistPosition} of ${seat.waitlistCount}`);
    await expect(mine.getByTestId('agenda-day-waitlisted')).toBeVisible();
    await expect(mine.getByTestId('agenda-day-clashes')).toContainText('1 clash');
    await expect(waitRow).toHaveAttribute('data-clash', 'true');
    await expect(seatRow).toHaveAttribute('data-clash', 'true');
    if (testInfo.project.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await shotForPR(page, 'My Agenda with a waitlist place and a clash');

    // Removing a row removes it at once: no navigation, the clash and the waitlisted time go with it.
    await page.evaluate(() => { window.__sameDocument = true; });
    await waitRow.getByRole('button', { name: 'Leave the waitlist' }).click();
    await expect(waitRow).toHaveCount(0);
    await expect(mine.getByTestId('agenda-day-clashes')).toHaveCount(0);
    await expect(seatRow).not.toHaveAttribute('data-clash', 'true');
    await expect(mine.getByTestId('agenda-day-waitlisted')).toHaveCount(0);
    await seatRow.getByRole('button', { name: 'Remove from my agenda' }).click();
    await expect(seatRow).toHaveCount(0);
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  } finally {
    await del(full.id);
    await del(clash.id);
  }

  // Nothing reserved: the empty state points back at the schedule.
  await page.route('**/api/users/*/schedule', (route) => route.fulfill({ json: { user: { id: lane.user }, days: [] } }));
  await visit(page, '/my-agenda', { as: lane.user });
  await expect(page.getByTestId('agenda-empty')).toBeVisible();
  await expect(page.getByTestId('agenda-empty').getByRole('link')).toHaveAttribute('href', '/schedule');
  expect(errors).toEqual([]);
});
