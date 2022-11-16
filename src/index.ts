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

const requestDOM = (
  url: string,
  siteName: string,
  nameFile: string,
  callback: any
): Promise<void> => {
  return needle('get', url).then(async (res) => {
    return await callback(siteName, nameFile, res);
  });
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
    await fs.writeFile(
      path.join(pathDirSite, `${nameFile}.html`),
      prettier.format(res.body, { parser: 'html' })
    );
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

    await fs.writeFile(
      path.join(pathDirCss, `${nameFile}.css`),
      prettier.format(res.body, { parser: 'css' })
    );
  } catch (err) {
    throw err;
  }
};

async function start(url: string) {
  const siteName: string = url.replace(/http(s|):\/\//, '');
  try {
    requestDOM(url, siteName, 'index', getHtmlFile).then(() => {
      hrefsMap[siteName]['css']?.forEach(async (href) => {
        const nameMatch = <RegExpMatchArray>href.match(/\/[\w-\_]+\.css/);
        if (nameMatch !== null) {
          const nameFile = nameMatch[0].replace(/\.\w+/, '').slice(1);
          await requestDOM(href, siteName, nameFile, getCssFile);
          //
        }
      });
    });
  } catch (err) {
    throw err;
  }
}

start('https://steklim-teplim.ru/');
