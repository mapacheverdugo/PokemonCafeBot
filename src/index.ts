import dotenv from 'dotenv';
import moment from "moment-timezone";
import schedule, { RecurrenceRule } from "node-schedule";
import { Browser } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { OPEN_HOUR } from "./constants";
import { authorize, getMessages } from "./gmail";
import { createBookingPuppeteer } from "./scrapper";
import { app } from './server';


dotenv.config();


puppeteer.use(StealthPlugin());

const browserOptions = {
  headless: process.env.HEADLESS_BROWSER != null ? process.env.HEADLESS_BROWSER == 'true' : true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  ignoreDefaultArgs: ['--enable-automation'],
  defaultViewport: {
    width: 900,
    height: 600,
  },
  timeout: 120000,
};

export let browser: Browser;


async function job(browser: Browser) {
  const date = moment().format('YYYY-MM-DD');
  const minutes = moment().format('mm');
  const id = `${date}_${minutes}`;

  console.log(`[${id}] Starting...`);

  try {
    await createBookingPuppeteer(browser, id, "Osaka", 3, null);
  } catch (error) {
    console.log(`[${id}] ${error}`);
  }
}

async function gmail() {
  const accessToken = await authorize();

  const messages = await getMessages(accessToken);
  console.log(messages);

  for (let message of messages) {
    console.log(message);
    console.log(message.payload.body.substr(message.payload.body.indexOf('■認証コード（Authentication code）'), 6));
  }
}

async function scheduleJobs() {
  job(browser);

  const rule0 = new RecurrenceRule();
  rule0.hour = OPEN_HOUR - 1;
  rule0.minute = 59;
  rule0.second = 59;
  rule0.tz = 'Asia/Tokyo';

  console.log(`Scheduling jobs for ${JSON.stringify(rule0)}`);

  const job0 = schedule.scheduleJob(rule0, async () => {
    job(browser);
  });

}


const port = process.env.PORT;


async function main() {
  browser = await puppeteer.launch(browserOptions);

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

main();
