import * as cheerio from "cheerio";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import express from 'express';
// import chromium from "@sparticuz/chromium";
// import puppeteer from 'puppeteer';

const app = express();
app.use(express.json());


async function searchGoogleMaps(businessName) {
    try {
        // const start = Date.now();
        puppeteerExtra.use(stealthPlugin());
        const browser = await puppeteerExtra.launch({
            headless: false,
            // headless: "new",
            // devtools: true,
            executablePath: "", // your path here
        });

        // const browser = await puppeteerExtra.launch({
        //   args: chromium.args,
        //   defaultViewport: chromium.defaultViewport,
        //   executablePath: await chromium.executablePath(),
        //   headless: "new",
        //   ignoreHTTPSErrors: true,
        // });

        const page = await browser.newPage();
        try {
            await page.goto(
                `https://www.google.com/maps/search/${businessName}`
            );
        } catch (error) {
            console.log("error going to page");
        }

        async function autoScroll(page) {
            await page.evaluate(async () => {
                const wrapper = document.querySelector('div[role="feed"]');
                await new Promise((resolve, reject) => {
                    var totalHeight = 0;
                    var distance = 1000;
                    var scrollDelay = 3000;

                    var timer = setInterval(async () => {
                        var scrollHeightBefore = wrapper.scrollHeight;
                        wrapper.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeightBefore) {
                            totalHeight = 0;
                            await new Promise((resolve) => setTimeout(resolve, scrollDelay));

                            // Calculate scrollHeight after waiting
                            var scrollHeightAfter = wrapper.scrollHeight;

                            if (scrollHeightAfter > scrollHeightBefore) {
                                // More content loaded, keep scrolling
                                return;
                            } else {
                                // No more content loaded, stop scrolling
                                clearInterval(timer);
                                resolve();
                            }
                        }
                    }, 200);
                });
            });
        }
        await autoScroll(page);


        const html = await page.content();
        const pages = await browser.pages();
        await Promise.all(pages.map((page) => page.close()));
        await browser.close();
        console.log("browser closed");


        // get all a tag parent where a tag href includes /maps/place/
        const $ = cheerio.load(html);
        const aTags = $("a");
        const parents = [];
        aTags.each((i, el) => {
            const href = $(el).attr("href");
            if (!href) {
                return;
            }
            if (href.includes("/maps/place/")) {
                parents.push($(el).parent());
            }
        });
        console.log("parents", parents);


        const buisnesses = [];
        parents.forEach((parent) => {
            const url = parent.find("a").attr("href");

            // get a tag where data-value="Website"
            const website = parent.find('a[data-value="Website"]').attr("href");

            // find a div that includes the class fontHeadlineSmall
            const storeName = parent.find("div.fontHeadlineSmall").text();

            // find span that includes class fontBodyMedium
            const ratingText = parent
                .find("span.fontBodyMedium > span")
                .attr("aria-label");

        // get the first div that includes the class fontBodyMedium
        const bodyDiv = parent.find("div.fontBodyMedium").first();
        const children = bodyDiv.children();
        const lastChild = children.last();
        const firstOfLast = lastChild.children().first();
        const lastOfLast = lastChild.children().last();

        buisnesses.push({
            placeId: `ChI${url?.split("?")?.[0]?.split("ChI")?.[1]}`,
            address: firstOfLast?.text()?.split("·")?.[1]?.trim(),
            category: firstOfLast?.text()?.split("·")?.[0]?.trim(),
            phone: lastOfLast?.text()?.split("·")?.[1]?.trim(),
            googleUrl: url,
            bizWebsite: website,
            storeName,
            ratingText,
            stars: ratingText?.split("stars")?.[0]?.trim()
            ? Number(ratingText?.split("stars")?.[0]?.trim())
            : null,
            numberOfReviews: ratingText
            ?.split("stars")?.[1]
            ?.replace("Reviews", "")
            ?.trim()
            ? Number(
                ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim()
                )
            : null,
        });
        });

        // console.log(`time in seconds ${Math.floor((end - start) / 1000)}`);
        return buisnesses;
    } catch (error) {
        console.log("error at googleMaps.....", error);
    }
}


app.post('/scrape-reviews', async (req, res) => {
    try {
        const { businessName } = req.body;
        if (!businessName) {
            return res.status(400).json({ error: 'Business name is required' });
        }

        let reviews = await searchGoogleMaps(businessName);
        let totalReviews=0 
        let totalRating=0
        reviews.map((item)=>{
            totalReviews +=item.numberOfReviews? item.numberOfReviews: 0
            totalRating += item.stars? item.stars: 0 
        })

        //coffeeShop Details
        let coffeeShopDetails={};
        coffeeShopDetails["totalShop"]= reviews.length
        coffeeShopDetails["averageRating"]= totalRating / reviews.length
        coffeeShopDetails["totalReviews"]= totalReviews
        coffeeShopDetails["latestReviews"]= reviews
        return res.status(200).send({message: "fetch data successfully!", data: coffeeShopDetails})
    } catch (error) {
        res.status(500).json({ error: 'Failed to scrape reviews' });
    }
});
    
    // Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});