const calls: string[] = [];

page.on('request', req => {
  if (req.url().includes('/api/group/create')) {
    calls.push(req.url());
  }
});

await page.click('#submit');

expect(calls.length).toBe(1); // fails if API called multiple times
