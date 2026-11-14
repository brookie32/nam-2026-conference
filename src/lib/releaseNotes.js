/** What shipped, grouped for the release-notes dialog (press 9). */
export const RELEASE_NOTES = [
  { group: 'Home', items: [
    { title: 'Up next for you', issues: [16] },
    { title: 'Happening now', issues: [23] },
    { title: 'Rate it prompt', issues: [24] },
    { title: 'Recommended for you strip', issues: [39] },
    { title: 'Welcome: pick your role and topics', issues: [45] },
    { title: 'For you in quick links and footer', issues: [54] },
  ] },
  { group: 'My Agenda', items: [
    { title: 'Your sessions by day, booked and waitlisted hours, clashes', issues: [15] },
    { title: 'Add my agenda to calendar', issues: [21] },
    { title: 'Travel warning between venues', issues: [22] },
    { title: 'Fill my gaps', issues: [47] },
  ] },
  { group: 'Finding talks', items: [
    { title: 'For you: interests and recommended talks', issues: [36] },
    { title: 'Recommendations learn from your ratings', issues: [46] },
    { title: 'Multi-track filter', issues: [1] },
    { title: 'Top-rated sort and rating badges', issues: [17] },
  ] },
  { group: 'Ask ORBIT', items: [
    { title: 'Chat about the programme', issues: [20] },
    { title: 'Tables in answers', issues: [41] },
    { title: 'Knows today and who’s asking, with generative UI session cards', issues: [44] },
    { title: 'Panel on every page, streaming, faster answers', issues: [48] },
  ] },
  { group: 'Mobile', items: [
    { title: 'Compact schedule cards', issues: [2] },
    { title: 'Jump to now', issues: [3, 25] },
    { title: 'Bottom tab bar', issues: [4] },
    { title: 'Speakers filters behind a button', issues: [5] },
    { title: 'Readable venue map', issues: [18] },
    { title: 'Session page fits 375px and 320px phones', issues: [11, 13] },
  ] },
  { group: 'Everywhere', items: [
    { title: 'Installable and readable offline', issues: [19] },
  ] },
];

export const issueUrl = (n) => `https://github.com/brookie32/nam-2026-conference/issues/${n}`;
