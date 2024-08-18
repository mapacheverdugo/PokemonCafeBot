import moment from "moment-timezone";
import schedule, { Range, RecurrenceRule } from "node-schedule";
import puppeteer, { Page } from "puppeteer";

const SCREENSHOTS_DIR = "screenshots";
const DAYS_BEFORE = 30;
const OPEN_HOUR = 18;
const OPEN_TIME = `${OPEN_HOUR}:00`;

async function selectMonth(page: Page, dateToBook: string) {
  const calendarPagerSelector = '#step2-form a.calendar-pager';
  await page.waitForSelector(calendarPagerSelector);

  const currentMonthYearSelector = '#step2-form h3';
  await page.waitForSelector(currentMonthYearSelector);
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
    const rawDate =  moment().tz('Asia/Tokyo').add(DAYS_BEFORE - 1, 'days');
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
  
  const selectedDate = await page.evaluate((dayToBook)  =>  {
    try {
      const calendarDaySelector = '#step2-form li';
    const calendarDayElements  = Array.from(document.querySelectorAll(calendarDaySelector));

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

async function createBooking(id: string, city: string, numOfGuests: number, dateToBook: string | undefined) {

  let url: string;

  if (city == "Tokyo") {
    url = "https://reserve.pokemon-cafe.jp/"
  } else if ( city == "Osaka") {
    url = "https://osaka.pokemon-cafe.jp/"
  } else {
    throw new Error("City not supported");
  }

  if (numOfGuests < 1) {
    throw new Error("Number of guests must be at least 1");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36");
  
  await page.goto(url + "reserve/step1");

  const selectNumGuestSelector = 'select[name=guest]';
  await page.waitForSelector(selectNumGuestSelector);
  await page.select(selectNumGuestSelector, numOfGuests.toString());

  const calendarSelector = 'input[name=date]';
  await page.waitForSelector(calendarSelector);

  const selectedDate = await selectDate(page, dateToBook);

  await page.screenshot({path: `${SCREENSHOTS_DIR}/${id}_calendar_selected.png`});

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

  const nextButtonSelector = '#submit_button';
  await page.waitForSelector(nextButtonSelector);

  await page.click(nextButtonSelector);

  await page.screenshot({path: `${SCREENSHOTS_DIR}/${id}_available_times.png`, });

}

async function run() {
  const rule = new RecurrenceRule();
  rule.hour = 10;
  rule.minute = new Range(0, 59);
  rule.tz = 'Asia/Tokyo'; 

  const job = schedule.scheduleJob(rule, async () => {
    const date = moment().format('YYYY-MM-DD');
    const minutes = moment().format('mm');
    const id = `${date}_${minutes}`;

    try {
      console.log(`[${id}] Starting...`);
      await createBooking(id, "Tokyo", 3, null);
      console.log(`[${id}] Date found`);
    } catch (error) {
      console.log(`[${id}] ${error}`);
    }
  });


}

run();
