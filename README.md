# ⛳ Golf Course Tycoon

A free, single-file browser game: design your own golf course, run it as a business, then play a round on it. No downloads, no sign-up, no build step — just open the HTML file in a browser.

**Play it:** open `index.html` in any modern browser (phone, tablet, or computer), or host it online with GitHub Pages (see below) and share the link.

## How to play

### 🎨 Design
- Pick a tool (Fairway, Tee, Green, Sand, Water, Trees, Path, or Clear), then click tiles on the grid to build.
- Each tile costs money, so watch your budget.
- To open for business you need at least **1 tee, 6 fairway tiles, and 1 green**, and a **course rating of 55% or more**.
- Sand, water, and trees raise your rating — a pretty, challenging course attracts more golfers.

### 📋 Manage
- Set your **green fee**, **marketing spend**, and **ground staff**.
- Click **Open for a day** to simulate a day of trading: visitor numbers depend on your course rating, reputation, price, marketing, and staff.
- Too high a fee scares golfers away; too few staff hurts your reputation. Find the profitable balance and grow your money and star rating (up to ★★★★★).

### 🏌️ Play
- Switch to Play to tee off on a hole sized from your own course design.
- Choose a club — **Driver** (long, less accurate), **Iron** (medium), or **Putter** (short and accurate near the green).
- Set your swing power and click **Swing**. Sink the ball in or under par to win prize money and boost your reputation.
- Your progress is saved automatically in your browser (local storage), so you can close the tab and come back later.

## Publish it on GitHub Pages (free hosting)

This game is one self-contained HTML file (`index.html` — all styles and code are inline, no other files or local paths needed), so it uploads as-is.

1. Create a new repository on GitHub (for example `golf-course-tycoon`) under the **Precis60** account.
2. Upload `index.html` to the repository (GitHub: **Add file → Upload files**, or `git add index.html && git commit && git push`).
3. In the repository, go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select the `main` branch and `/ (root)`, then **Save**.
5. Wait a minute or two — GitHub will show your live URL, usually:
   `https://precis60.github.io/golf-course-tycoon/`
6. Link to it from any website with a normal link, for example:
   `<a href="https://precis60.github.io/golf-course-tycoon/">⛳ Play Golf Course Tycoon</a>`

Anyone who clicks the link can play in their browser — nothing to install.

## Files

- `index.html` — the whole game (HTML, CSS, and JavaScript in one file)
- `README.md` — this file
