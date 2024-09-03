import moment from "moment-timezone";
import schedule, { Range, RecurrenceRule } from "node-schedule";
import puppeteer, { Browser } from "puppeteer";
import { OPEN_HOUR } from "./constants";
import { createBookingMethod2, createBookingPuppeteer } from "./method1";

const browserOptions = {
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: {
    width: 1920,
    height: 1080,
  },
  timeout: 120000,
};



async function job(browser: Browser) {
  const date = moment().format('YYYY-MM-DD');
  const minutes = moment().format('mm');
  const id = `${date}_${minutes}`;

  console.log(`[${id}] Starting...`);

  try {

    await createBookingPuppeteer(browser, id, "Tokyo", 3, null);
  } catch (error) {
    console.log(`[${id}] ${error}`);
  }

}


async function run() {
  const browser = await puppeteer.launch(browserOptions);

  createBookingMethod2(browser, "test", "Tokyo", 3, null);

  const rule1 = new RecurrenceRule();
  rule1.hour = 12;
  rule1.minute = new Range(0, 30);
  rule1.tz = 'Asia/Tokyo';

  console.log("New version");

  console.log(`Scheduling jobs for ${JSON.stringify(rule1)}`);

  const job1 = schedule.scheduleJob(rule1, async () => {
    job(browser);
  });

  const rule2 = new RecurrenceRule();
  rule2.hour = OPEN_HOUR - 1;
  rule2.minute = new Range(55, 59);
  rule2.tz = 'Asia/Tokyo';

  console.log(`Scheduling jobs for  ${JSON.stringify(rule2)}`);

  const job2 = schedule.scheduleJob(rule2, async () => {
    job(browser);

  });






}

run();
