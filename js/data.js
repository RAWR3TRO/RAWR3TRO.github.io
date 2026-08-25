/* ============================================================
   THE FEED — the tapes loaded into the set.

   `vid`   a 6s muted loop, trimmed out of the finished edit.
   `link`  where ✕ / START / the ↗ send you. These are cuts from
           the archive rather than individual posts, so they all
           point at the profile — there is no per-post permalink
           to be honest about.
   `img`   the poster, pulled from the FIRST FRAME OF THAT LOOP —
           so the still and the motion can never disagree. It is
           what the screen shows until the clip has buffered.

   The loop is only fetched when its channel is selected, so first
   paint never waits on video.
   ============================================================ */
window.RR_WORKS = [
  {
    id: 'rwb',
    title: 'RWB',
    sub: 'Rauh-Welt widebody, built in the open',
    meta: 'MEET · 2026',
    img: 'assets/works/rwb.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/rwb.mp4'
  },
  {
    id: 'daytona',
    title: 'DAYTONA',
    sub: 'All day in the infield',
    meta: 'MEET · 2025',
    img: 'assets/works/daytona.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/daytona.mp4'
  },
  {
    id: 'glitch',
    title: 'GLITCH',
    sub: 'Carbon, alcantara and a bad tracking head',
    meta: 'EDIT · 2026',
    img: 'assets/works/glitch.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/glitch.mp4'
  },
  {
    id: 'q37',
    title: 'Q37',
    sub: 'Night run',
    meta: 'EDIT · 2026',
    img: 'assets/works/q37.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/q37.mp4'
  },
  {
    id: 'ucf',
    title: 'UCF MEET',
    sub: 'Parking garage, January',
    meta: 'MEET · JAN 2025',
    img: 'assets/works/ucf.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/ucf.mp4'
  },
  {
    id: 'rollerz',
    title: 'ROLLERZ',
    sub: 'Rolling shots, no tripod',
    meta: 'EDIT · 2026',
    img: 'assets/works/rollerz.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/rollerz.mp4'
  },
  {
    id: 'sd480',
    title: 'SD 480',
    sub: 'Straight off the tape, ungraded',
    meta: 'EDIT · 2025',
    img: 'assets/works/sd480.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/sd480.mp4'
  },
  {
    id: 'thelab',
    title: 'THE LAB',
    sub: 'Iron, mirrors and a date stamp',
    meta: 'SESSION · JAN 2026',
    img: 'assets/works/thelab.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/thelab.mp4'
  },
  {
    id: 'lab1',
    title: 'THE LAB II',
    sub: 'Second session',
    meta: 'SESSION · FEB 2026',
    img: 'assets/works/lab1.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/lab1.mp4'
  },
  {
    id: 'lab2',
    title: 'LATE SETS',
    sub: 'Closing the place down',
    meta: 'SESSION · FEB 2026',
    img: 'assets/works/lab2.jpg',
    link: 'https://www.instagram.com/raw._retro/',
    vid: 'assets/reels/lab2.mp4'
  }
];
