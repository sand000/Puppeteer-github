const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

app.get("/github-user/:username", async (req, res) => {
  const username = req.params.username;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    await page.goto(`https://github.com/${username}`, { waitUntil: "domcontentloaded" });

    // Wait for profile name or 404 check
    const isUser = (await page.$('h1[class*="v-align-middle"]')) !== null;
    if (isUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const data = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : null;
      };

      const name = getText("h1.vcard-names span.p-name");
      const username = getText("h1.vcard-names span.p-nickname");
      const bio = getText("div.p-note");

      const repositories = parseInt(getText('a[href$="?tab=repositories"] span.Counter')?.replace(",", "") || 0);
      const followers = parseInt(getText(`a[href$="?tab=followers"] span`)?.replace(",", "") || 0);
      const following = parseInt(getText(`a[href$="?tab=following"] span`)?.replace(",", "") || 0);

      return { name, username, bio, repositories, followers, following };
    });

    // Navigate to repositories tab
    await page.goto(`https://github.com/${username}?tab=repositories`, { waitUntil: "domcontentloaded" });

    // Wait for repositories to load
    await page.waitForSelector('li[itemprop="owns"]', { timeout: 5000 }).catch(() => {});

    const topRepositories = await page.evaluate(() => {
      const repos = [];
      const items = document.querySelectorAll('li[itemprop="owns"]');
      for (let i = 0; i < Math.min(10, items.length); i++) {
        const repoEl = items[i];
        const nameEl = repoEl.querySelector('a[itemprop="name codeRepository"]');
        const starsEl = repoEl.querySelector('a[href$="/stargazers"]');
        const name = nameEl?.innerText.trim();
        const stars = starsEl ? parseInt(starsEl.innerText.trim().replace(",", "") || 0) : 0;
        if (name) repos.push({ name, stars });
      }

      // Sort by stars
      return repos.sort((a, b) => b.stars - a.stars).slice(0, 3);
    });

    await browser.close();

    return res.json({ ...data, top_repositories: topRepositories });
  } catch (error) {
    await browser.close();
    console.error(error);
    return res.status(500).json({ error: "An error occurred while scraping GitHub." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
