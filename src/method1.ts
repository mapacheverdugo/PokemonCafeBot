import axios from "axios";
import { writeFileSync } from "fs";
import moment from "moment-timezone";
import { Browser, Page } from "puppeteer";
import { DAYS_BEFORE, OPEN_TIME, SCREENSHOTS_DIR } from "./constants";

const defaultTimeout = 60000;

async function selectMonth(page: Page, dateToBook: string) {
  const calendarPagerSelector = '#step2-form a.calendar-pager';
  await page.waitForSelector(calendarPagerSelector, { timeout: defaultTimeout });

  const currentMonthYearSelector = '#step2-form h3';
  await page.waitForSelector(currentMonthYearSelector, { timeout: defaultTimeout });
  const currentMonthYearElement = await page.$(currentMonthYearSelector);
  const currentMonthYear = await page.evaluate((element) => element.textContent, currentMonthYearElement);

  const currentMonthYearParts = currentMonthYear.split('年');
  const currentYear = parseInt(currentMonthYearParts[0]);
  const currentMonth = parseInt(currentMonthYearParts[1].replace('月', ''));

  const dateToBookParts = dateToBook.split('-');
  const yearToBook = parseInt(dateToBookParts[0]);
  const monthToBook = parseInt(dateToBookParts[1]);

  const monthDiff = (yearToBook - currentYear) * 12 + (monthToBook - currentMonth);

  const calendarPagerElements = await page.$$(calendarPagerSelector);
  const prevMonthElement = calendarPagerElements[0];
  const nextMonthElement = calendarPagerElements[1];

  if (monthDiff > 0) {
    for (let i = 0; i < monthDiff; i++) {
      await nextMonthElement.click();
    }
  } else if (monthDiff < 0) {
    for (let i = 0; i < monthDiff * -1; i++) {
      await prevMonthElement.click();
    }
  }
}

async function selectDate(page: Page, dateToBook: string | undefined) {
  if (!dateToBook) {
    const rawDate = moment().tz('Asia/Tokyo').add(DAYS_BEFORE - 1, 'days');
    let dateOpened = rawDate.format('YYYY-MM-DD');

    if (rawDate.hours() >= parseInt(OPEN_TIME.split(':')[0])) {
      dateOpened = rawDate.add(1, 'days').format('YYYY-MM-DD');
    }
    await selectMonth(page, dateOpened);
  } else {
    await selectMonth(page, dateToBook);
  }


  let dayToBook = null;
  if (dateToBook) {
    const dateParts = dateToBook.split('-');
    dayToBook = parseInt(dateParts[2]);
  }

  const selectedDate = await page.evaluate((dayToBook) => {
    try {
      const calendarDaySelector = '#step2-form li';
      const calendarDayElements = Array.from(document.querySelectorAll(calendarDaySelector));

      const filteredDays = calendarDayElements.filter((li) => {
        if (dayToBook) {
          return li.childNodes[0].childNodes[0].nodeType == 3 && (li.childNodes[0].childNodes[0] as Text).data == dayToBook.toString();
        } else {
          const status = li.childNodes[0].childNodes[2].textContent.replace('(', '').replace(')', '');
          const available = status != 'Full' && status != 'N/A';
          return available;
        }
      });

      let dayToBookLiElement = filteredDays.length > 0 ? filteredDays[filteredDays.length - 1] : null

      if (dayToBookLiElement == null) {
        return null;
      }

      (dayToBookLiElement as HTMLElement).click();

      const number = (dayToBookLiElement.childNodes[0].childNodes[0] as Text).data;
      const statusJapanese = dayToBookLiElement.childNodes[0].childNodes[1].textContent;
      const status = dayToBookLiElement.childNodes[0].childNodes[2].textContent.replace('(', '').replace(')', '');
      const available = status != 'Full' && status != 'N/A';

      return {
        number,
        statusJapanese,
        status,
        available,
        raw: dayToBookLiElement.textContent,
      }
    } catch (error) {
      return error;
    }
  }, dayToBook);

  return selectedDate;
}

async function openBookingPage(id: string, city: string, browser: Browser, successSelector: string, retries: number = 10): Promise<Page> {
  const url = getUrl(id, city);

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36");

  await page.goto(url + "reserve/step1", { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_just_opened.png` });

  let successSelectorFound = false;
  let currentTries = 0;
  while (!successSelectorFound && currentTries < retries) {
    try {
      await page.waitForSelector(successSelector, { timeout: 1000 });
      successSelectorFound = true;
      break;
    } catch (error) {
      successSelectorFound = false;
    }

    if (!successSelectorFound) {
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_searching_selector_try_${currentTries}.png` });

      try {
        const pageSourceHTML = await page.content();
        const filename = `${SCREENSHOTS_DIR}/${Date.now()}_${id}_searching_selector_try_${currentTries}.html`;

        writeFileSync(filename, pageSourceHTML, { flag: 'w' });

        const buttonText = 'リロードする（Reloading）'

        await page.evaluate((buttonText) => {
          const buttonEl = Array.from(document.querySelectorAll('button'))
            .find(el => el.textContent === buttonText);

          if (buttonEl) {
            buttonEl.click();
          }
        }, buttonText);

        await page.waitForNetworkIdle();

        await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_searching_selector_reload_after.png` });
      } catch (error) {

      }


      try {
        const formAgreeSelector = '#forms-agree';

        await page.waitForSelector(formAgreeSelector, { timeout: 1000 });

        const formAgreeCheckboxSelector = '#forms-agree > div > div.button-container > label';
        const formAgreeButtonSelector = '#forms-agree > div > div.button-container-agree > button';

        await page.click(formAgreeCheckboxSelector);
        await page.click(formAgreeButtonSelector);

        await page.waitForNetworkIdle();

        await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_searching_selector_form_to_agree_step_2.png` });

        const continueButtonSelector = 'body > div > div > div.column.is-8 > div > div > a';
        await page.waitForSelector(continueButtonSelector, { timeout: 1000 });
        await page.click(continueButtonSelector);

        await page.waitForNetworkIdle();

        await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_searching_selector_form_to_agree_after.png` });
      } catch (error) {

      }

      currentTries++;
    }

  }

  if (successSelectorFound) {
    console.log(`[${id}] Success selector found after ${currentTries} tries`);
  } else {
    console.log(`[${id}] Success selector not found after ${currentTries} tries`);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_selector_not_found.png` });
  }

  return page;
}

function getUrl(id: string, city: string): string {
  if (city == "Tokyo") {
    return "https://reserve.pokemon-cafe.jp/"
  } else if (city == "Osaka") {
    return "https://osaka.pokemon-cafe.jp/"
  } else {
    throw new Error("City not supported");
  }
}

export async function createBookingPuppeteer(browser: Browser, id: string, city: string, numOfGuests: number, dateToBook: string | undefined) {
  if (numOfGuests < 1) {
    throw new Error("Number of guests must be at least 1");
  }

  const selectNumGuestSelector = 'select[name=guest]';

  const page = await openBookingPage(id, city, browser, selectNumGuestSelector);

  try {
    await page.waitForSelector(selectNumGuestSelector, { timeout: defaultTimeout });
    await page.select(selectNumGuestSelector, numOfGuests.toString());

    const calendarSelector = 'input[name=date]';
    await page.waitForSelector(calendarSelector, { timeout: defaultTimeout });

    const selectedDate = await selectDate(page, dateToBook);

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_calendar_selected.png` });

    if (selectedDate == null) {
      if (dateToBook) {
        throw new Error("Date not found");
      } else {
        throw new Error("No available date");
      }
    }

    if (!selectedDate.available) {
      throw new Error("Date not available");
    }

    console.log(`[${id}] Date available: ${selectedDate.raw}`);

    const nextButtonSelector = '#submit_button';
    await page.waitForSelector(nextButtonSelector, { timeout: defaultTimeout });

    await page.click(nextButtonSelector);

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_available_times.png`, });
  } catch (error) {
    console.log(`[${id}] ${error}`);

  } finally {
    await page.close();
  }
}

export async function createBookingMethod2(browser: Browser, id: string, city: string, numOfGuests: number, dateToBook: string | undefined) {
  const page = await openBookingPage(id, city, browser, 'select[name=guest]');

  const tokenSelector = 'meta[name="csrf-token"]';

  await page.waitForSelector(tokenSelector);

  const token = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    return element.getAttribute('content');
  }, tokenSelector);

  const localStorage = await page.evaluate(() => Object.assign({}, window.localStorage));


  await page.close();

  const res = await axios.post("https://reserve.pokemon-cafe.jp/reserve/step1", {

  });

  //const $ = cheerio.load(data);
}

