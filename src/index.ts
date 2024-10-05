
import moment from "moment-timezone";
import { Browser } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { authorize, getMessages } from "./gmail";
import { createBookingPuppeteer } from "./method1";

puppeteer.use(StealthPlugin());


const browserOptions = {
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  ignoreDefaultArgs: ['--enable-automation'],
  defaultViewport: {
    width: 1300,
    height: 700,
  },
  timeout: 120000,
};



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


async function run() {
  //const browser = await puppeteer.launch(browserOptions);

  console.log("New version with new navigation and recording");

  const accessToken = await authorize();

  const messages = await getMessages(accessToken);
  console.log(messages);

  for (let message of messages) {
    console.log(message);
    console.log(message.payload.body.substr(message.payload.body.indexOf('■認証コード（Authentication code）'), 6));
  }

  //job(browser);

  /*   const rule0 = new RecurrenceRule();
    rule0.hour = OPEN_HOUR - 1;
    rule0.minute = 59;
    rule0.second = 59;
    rule0.tz = 'Asia/Tokyo';
  
    console.log(`Scheduling jobs for ${JSON.stringify(rule0)}`);
  
    const job0 = schedule.scheduleJob(rule0, async () => {
      job(browser);
    }); */


}

run();
