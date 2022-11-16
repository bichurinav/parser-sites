// import { config } from 'dotenv';
import needle from 'needle';
import fs from 'node:fs/promises';
import path from 'node:path';
import cheerio from 'cheerio';
import prettier from 'prettier';

// const { parsed: cfg }: any = config();
const dirname: string = path.resolve();

interface HrefsMap {
  [SiteName: string]: {
    css?: string[];
    js?: string[];
    img?: string[];
  };
}

const hrefsMap: HrefsMap = {};

const requestDOM = async (
  url: string,
  siteName: string,
  nameFile: string,
  callback: any
): Promise<string> => {
  try {
    const data: string = await new Promise((resolve, reject) => {
      needle('get', url)
        .then((body) => {
          resolve(callback(siteName, nameFile, body));
        })
        .catch((err) => reject(err));
    });
    return data;
  } catch (err) {
    throw err;
  }
};

const getHtmlFile = async (siteName: string, nameFile: string, res: any) => {
  if (hrefsMap[siteName]) {
    return;
  }
  try {
    const pathDirSite = path.join(dirname, 'sites', <string>siteName);
    await fs.mkdir(pathDirSite, {
      recursive: true,
    });
    // await fs.writeFile(
    //   path.join(pathDirSite, `${nameFile}.html`),
    //   prettier.format(res.body, { parser: 'html' })
    // );
    const html = res.body;

    const $ = cheerio.load(html);

    const formatHref = (href: string): string => {
      if (!/http(s|):\/\//.test(href)) {
        return `http://${siteName}/${href}`;
      }
      return href;
    };

    const getCssHrefs = (): string[] => {
      const cssHrefs: string[] = [];
      $('link').each((_, el) => {
        const attr = $(el).attr();
        if (
          attr['rel'] === 'stylesheet' &&
          /\.css/.test(attr['href']) &&
          !/(wp|classic-theme-styles-css)/.test(attr['id'])
        ) {
          cssHrefs.push(formatHref(attr['href']));
        }
      });
      return cssHrefs;
    };

    const getJsHrefs = (): string[] => {
      const jsHrefs: string[] = [];

      $('script').each((_, el) => {
        const attr = $(el).attr();

        if (attr['type'] === 'text/javascript' && attr['src'] !== undefined) {
          jsHrefs.push(formatHref(attr['src']));
        }
      });

      return jsHrefs;
    };

    const getImagesHrefs = (): string[] => {
      const imgHrefs: string[] = [];
      $('img').each((_, el) => {
        const attr = $(el).attr();
        if (/\.[png|jpg|svg]/.test(attr['src'])) {
          imgHrefs.push(formatHref(attr['src']));
        }
      });
      return imgHrefs;
    };

    hrefsMap[siteName] = {
      css: getCssHrefs(),
      js: getJsHrefs(),
      img: getImagesHrefs(),
    };

    return html;
  } catch (err) {
    throw err;
  }
};

const getCssFile = async (siteName: string, nameFile: string, res: any) => {
  try {
    const pathDirCss = path.join(
      dirname,
      'sites',
      <string>siteName,
      'assets',
      'css'
    );
    await fs.mkdir(pathDirCss, {
      recursive: true,
    });

    const cssText = res.body;

    await fs.writeFile(
      path.join(pathDirCss, `${nameFile}.css`),
      prettier.format(cssText, { parser: 'css' })
    );

    return cssText;
  } catch (err) {
    throw err;
  }
};

async function start(url: string): Promise<string> {
  const siteName: string = url.replace(/http(s|):\/\//, '');
  const pathDirSite: string = path.join(dirname, 'sites', siteName);
  await fs.mkdir(pathDirSite, {
    recursive: true,
  });

  try {
    const htmlText: string = await requestDOM(
      url,
      siteName,
      'index',
      getHtmlFile
    );
    // Взаимодействие с CSS
    hrefsMap[siteName]['css']?.forEach(async (href) => {
      const nameMatch = <RegExpMatchArray>href.match(/\/[\w-\_]+\.css/);
      if (nameMatch !== null) {
        const nameFile = nameMatch[0].replace(/\.\w+/, '').slice(1);
        await requestDOM(href, siteName, nameFile, getCssFile);

        //console.log(str);
        const reg = new RegExp(
          `<link.*rel=('|")stylesheet('|").*href=('|").*${nameFile}.*\.css.*('|").*>`
        );
        const $ = cheerio.load(htmlText);
        $(`link[href*=${nameFile}]`).attr('href', `assets/css/${nameFile}.css`);

        // await fs.writeFile(
        //   path.join(pathDirSite, `${nameFile}.html`),
        //   prettier.format(res.body, { parser: 'html' })
        // );`

        // const res = htmlText.match(new RegExp(reg));
        // console.log(res);

        //htmlText.match(new RegExp(str));
      }
    });

    return 'Парсер отработал!';
  } catch (err) {
    throw err;
  }
}

start('https://retro-blues.ru/').then((message) => {
  console.log(message, '\n', '');
});
