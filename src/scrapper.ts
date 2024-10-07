import { writeFileSync } from 'fs';
import { Browser, ElementHandle, Page, ScreenRecorder } from "puppeteer";
import UserAgent from 'user-agents';
import { SCREENSHOTS_DIR } from "./constants";

const defaultTimeout = 60000;

interface DateState {
  date: string;
  available: boolean;
  status: string;
  statusJapanese: string;
}

interface DateStateWithElement extends DateState {
  element: ElementHandle<HTMLElement>;
}

interface TimeState {
  time: string;
  available: boolean;
  status: string;
  statusJapanese: string;
  seatType: string;
}

interface TimeStateWithElement extends TimeState {
  element: ElementHandle<HTMLElement>;
}

async function selectMonth(page: Page, { byDate, byIndex }: { byDate?: string | undefined, byIndex?: number | undefined }) {
  const calendarPagerSelector = '#step2-form a.calendar-pager';
  await page.waitForSelector(calendarPagerSelector, { timeout: defaultTimeout });

  const currentMonthYearSelector = '#step2-form h3';
  await page.waitForSelector(currentMonthYearSelector, { timeout: defaultTimeout });
  const currentMonthYearElement = await page.$(currentMonthYearSelector);
  const currentMonthYear = await page.evaluate((element) => element.textContent, currentMonthYearElement);

  const currentMonthYearParts = currentMonthYear.split('年');
  const currentYear = parseInt(currentMonthYearParts[0]);
  const currentMonth = parseInt(currentMonthYearParts[1].replace('月', ''));



  const calendarPagerElements = await page.$$(calendarPagerSelector);
  const prevMonthElement = calendarPagerElements[0];
  const nextMonthElement = calendarPagerElements[1];

  if (byDate) {
    const dateToBookParts = byDate.split('-');
    const yearToBook = parseInt(dateToBookParts[0]);
    const monthToBook = parseInt(dateToBookParts[1]);

    const monthDiff = (yearToBook - currentYear) * 12 + (monthToBook - currentMonth);

    if (monthDiff > 0) {
      for (let i = 0; i < monthDiff; i++) {
        await nextMonthElement.click();
      }
    } else if (monthDiff < 0) {
      for (let i = 0; i < monthDiff * -1; i++) {
        await prevMonthElement.click();
      }
    }
  } else if (byIndex) {
    if (byIndex > 0) {
      for (let i = 0; i < byIndex; i++) {
        await nextMonthElement.click();
      }
    } else if (byIndex < 0) {
      for (let i = 0; i < byIndex * -1; i++) {
        await prevMonthElement.click();
      }
    }
  }


}



async function getDatesStatus(page: Page): Promise<DateStateWithElement[]> {
  const dates: DateStateWithElement[] = [];

  const calendarDaySelector = '#step2-form li';
  const calendarDayElements = await page.$$(calendarDaySelector);

  const currentMonthYearSelector = '#step2-form h3';
  await page.waitForSelector(currentMonthYearSelector, { timeout: defaultTimeout });
  const currentMonthYearElement = await page.$(currentMonthYearSelector);
  const currentMonthYear = await page.evaluate((element) => element.textContent, currentMonthYearElement);

  const currentMonthYearParts = currentMonthYear.split('年');
  const currentYear = parseInt(currentMonthYearParts[0]);
  const currentMonth = parseInt(currentMonthYearParts[1].replace('月', ''));

  for (let i = 0; i < calendarDayElements.length; i++) {
    const calendarDayElement = calendarDayElements[i];
    const date = await page.evaluate((element) => {
      return element.childNodes[0].childNodes[0].textContent;
    }, calendarDayElement);

    const statusJapanese = await page.evaluate((element) => {
      return element.childNodes[0].childNodes[1].textContent;
    }, calendarDayElement);

    const status = await page.evaluate((element) => {
      return element.childNodes[0].childNodes[2].textContent.replace('(', '').replace(')', '');
    }, calendarDayElement);

    const available = status != 'Full' && status != 'N/A';

    dates.push({
      date: `${currentYear}-${currentMonth}-${date}`,
      available,
      status,
      statusJapanese,
      element: calendarDayElement,
    });
  }
  return dates;
}

async function getDatesStatusUpToXMonths(page: Page, xMonths: number): Promise<DateStateWithElement[]> {
  const dates: { date: string, available: boolean, status: string, statusJapanese: string, element: ElementHandle<HTMLElement> }[] = [];

  for (let i = 0; i < xMonths; i++) {
    if (i > 0) {
      await selectMonth(page, { byIndex: 1 });
    }

    const newDates = await getDatesStatus(page);
    dates.push(...newDates);
  }
  return dates;
}

async function checkAvailability(page: Page, dates: string[]): Promise<DateState[]> {
  let availableDates: DateState[] = [];

  const dateStatuses = await getDatesStatusUpToXMonths(page, 3);
  availableDates = dateStatuses.filter((date) => date.available);
  if (dates != null && dates.length > 0) {
    availableDates = availableDates.filter((date) => dates.includes(date.date));
  }
  return availableDates;
}

async function selectDate(page: Page, dateToBook: string | undefined): Promise<DateState | null> {
  let dateFound: DateStateWithElement | undefined = null;

  if (!dateToBook) {
    // First available date
    const dates = await getDatesStatusUpToXMonths(page, 3);
    const firstAvailableDate = dates.find((date) => date.available);
    if (firstAvailableDate) {
      dateFound = firstAvailableDate;
    }
  } else {
    await selectMonth(page, { byDate: dateToBook });
    const dates = await getDatesStatus(page);
    const dateToBookParts = dateToBook.split('-');
    const dayToBook = parseInt(dateToBookParts[2]);
    dateFound = dates.find((date) => date.date == dayToBook.toString() && date.available);
  }

  await page.evaluate((element) => {
    element.click();
  }, dateFound.element);

  const nextButtonSelector = '#submit_button';
  await page.click(nextButtonSelector);


  return dateFound;
}


async function getTimesStatus(page: Page): Promise<TimeStateWithElement[]> {

  const times: TimeStateWithElement[] = [];

  const timeSelector = '#time_table > tbody > tr > td > div';
  const timeElements = await page.$$(timeSelector);

  for (let i = 0; i < timeElements.length; i++) {
    const timeElement = timeElements[i];


    const time = await page.evaluate((element) => {
      const timeSelector = 'div.timetext';
      return element.querySelector(timeSelector)?.textContent;
    }, timeElement);

    const status = await page.evaluate((element) => {
      const statusSelector = 'div.status-box > div:nth-child(2)';
      return element.querySelector(statusSelector)?.textContent;
    }, timeElement);

    const statusJapanese = await page.evaluate((element) => {
      const statusSelector = 'div.status-box > div:nth-child(1)';
      return element.querySelector(statusSelector)?.textContent;
    }, timeElement);

    const seatType = await page.evaluate((element) => {
      const seatTypeSelector = 'div.seattypetext';
      const seatTypeElement = element.querySelector(seatTypeSelector);
      return seatTypeElement?.textContent;
    }, timeElement);

    const timeAElement = await timeElement.$('a');

    times.push({
      time,
      available: status != 'Full' && status != 'N/A',
      status,
      statusJapanese,
      seatType,
      element: timeAElement ?? timeElement,
    });
  }
  return times;
}

async function selectTime(id: string, page: Page, timeToBook: string | undefined): Promise<TimeState | null> {
  const timeTableSelector = '#time_table';
  page = await ensureNavigation(page, timeTableSelector, null);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_available_times.png`, });

  const times = await getTimesStatus(page);


  let timeFound: TimeStateWithElement | null = null;

  if (!timeToBook) {
    const firstAvailableTime = times.find((time) => time.available);
    if (firstAvailableTime) {
      timeFound = firstAvailableTime;
    }
  } else {
    timeFound = times.find((time) => time.time == timeToBook && time.available);
  }

  console.log('timeFound', timeFound);

  if (timeFound) {
    await page.evaluate((element) => {
      element.click();
    }, timeFound.element);
  }

  return timeFound;
}

async function fillForm(page: Page) {
  const formSelector = '#step3-form';
  await page.waitForSelector(formSelector, { timeout: defaultTimeout });

  const nameInputSelector = '#name';
  const nameKanaInputSelector = '#name_kana';
  const phoneNumberInputSelector = '#phone_number';
  const emailInputSelector = '#email';
  const submitButtonSelector = '#submit_button';

  await page.type(nameInputSelector, 'Jorge Verdugo');
  await page.type(nameKanaInputSelector, 'Jorge Verdugo');
  await page.type(phoneNumberInputSelector, '56965830745');
  await page.type(emailInputSelector, 'jorgeverdugoch@gmail.com');

  await page.click(submitButtonSelector);
}

async function saveHtml(page: Page, filename: string) {
  const pageSourceHTML = await page.content();
  const path = `${SCREENSHOTS_DIR}/${filename}`;

  writeFileSync(path, pageSourceHTML, { flag: 'w' });
}

async function ensureNavigation(page: Page, successSelector: string, url: string | null, retries: number = 100): Promise<Page> {
  const timeout = 100;

  if (url == null) {
    await page.waitForNetworkIdle({ timeout: defaultTimeout });
  } else {
    await page.goto(url, { waitUntil: 'networkidle0' });
  }

  let successSelectorFound = false;
  let currentTries = 0;
  while (!successSelectorFound && currentTries < retries) {
    currentTries++;
    try {
      await page.waitForSelector(successSelector, { timeout: timeout });
      successSelectorFound = true;
      break;
    } catch (error) {
      successSelectorFound = false;
    }

    if (!successSelectorFound) {

      try {
        //await saveHtml(page, `${Date.now()}_searching_selector_try_${currentTries}.html`);

        const reloadButtonSel = 'body > div > div > div.column.is-8 > div > div > a.button.arrow-down'

        await page.waitForSelector(reloadButtonSel, { timeout: timeout });
        await page.click(reloadButtonSel);

        await page.waitForNetworkIdle({ timeout: defaultTimeout });

      } catch (error) {
        //console.log(`Error while trying to reload page: ${error}`);
      }


      try {
        const formAgreeSelector = '#forms-agree';

        await page.waitForSelector(formAgreeSelector, { timeout: timeout });

        const formAgreeCheckboxSelector = '#forms-agree > div > div.button-container > label';
        const formAgreeButtonSelector = '#forms-agree > div > div.button-container-agree > button';

        await page.click(formAgreeCheckboxSelector);
        await page.click(formAgreeButtonSelector);

        await page.waitForNetworkIdle({ timeout: defaultTimeout });

        const continueButtonSelector = 'body > div > div > div.column.is-8 > div > div > a';
        await page.waitForSelector(continueButtonSelector, { timeout: timeout });
        await page.click(continueButtonSelector);

        await page.waitForNetworkIdle({ timeout: defaultTimeout });

      } catch (error) {
        //console.log(`Error while trying to agree form: ${error}`);
      }


    }

  }

  if (successSelectorFound) {
    //console.log(`Success selector "${successSelector}" found after ${currentTries} tries`);
  } else {
    //console.log(`Success selector "${successSelector}" not found after ${currentTries} tries`);
  }

  return page;
}



function getUrl(city: string): string {
  if (city.toLowerCase() == "tokyo") {
    return "https://reserve.pokemon-cafe.jp/"
  } else if (city.toLowerCase() == "osaka") {
    return "https://osaka.pokemon-cafe.jp/"
  } else {
    throw new Error("City not supported");
  }
}

export async function createBookingPuppeteer(browser: Browser, id: string, city: string, numOfGuests: number, dateToBook: string | undefined, options?: { record: boolean } | null) {
  if (numOfGuests < 1) {
    throw new Error("Number of guests must be at least 1");
  }

  const selectNumGuestSelector = 'select[name=guest]';

  const url = getUrl(city);

  let page = await browser.newPage();
  const userAgent = new UserAgent();
  await page.setUserAgent(userAgent.random().toString());


  let recorder: ScreenRecorder | null;
  if (options?.record) {
    recorder = await page.screencast({ path: `${SCREENSHOTS_DIR}/${Date.now()}_${id}_recording.webm` });
  }

  page = await ensureNavigation(page, selectNumGuestSelector, url);

  try {
    await page.select(selectNumGuestSelector, numOfGuests.toString());

    const calendarSelector = 'input[name=date]';
    page = await ensureNavigation(page, calendarSelector, null);

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

    const selectedTime = await selectTime(id, page, undefined);

    if (selectedTime == null) {
      throw new Error("Time not found");
    }

    await fillForm(page);

    await ensureNavigation(page, '#step4-form', null);

  } catch (error) {
    console.log(`[${id}] ${error}`);

  } finally {
    if (options?.record) {
      await recorder.stop();
    }
    await page.close();
  }
}

export async function checkAvailabilityDates(browser: Browser, city: string, numOfGuests: number, dates: string[], options?: { record?: boolean }): Promise<DateState[]> {
  if (numOfGuests < 1) {
    throw new Error("Number of guests must be at least 1");
  }

  const selectNumGuestSelector = 'select[name=guest]';

  const url = getUrl(city);

  let page = await browser.newPage();
  const userAgent = new UserAgent();
  await page.setUserAgent(userAgent.random().toString());

  let recorder: ScreenRecorder | null;
  if (options?.record) {
    recorder = await page.screencast({ path: `${SCREENSHOTS_DIR}/${Date.now()}_recording.webm` });
  }

  page = await ensureNavigation(page, selectNumGuestSelector, url);

  try {
    await page.select(selectNumGuestSelector, numOfGuests.toString());

    const calendarSelector = 'input[name=date]';
    page = await ensureNavigation(page, calendarSelector, null);

    const dateStatuses = await checkAvailability(page, dates);

    await page.close();
    return dateStatuses;
  } catch (error) {
    console.log(`${error}`);
    if (options?.record) {
      await recorder.stop();
    }

    await page.close();
    throw error;
  }
}