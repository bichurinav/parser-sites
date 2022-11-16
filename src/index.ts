// import { config } from 'dotenv';
import needle from 'needle';
import fs from 'node:fs/promises';
import path from 'node:path';
import cheerio from 'cheerio';
import prettier from 'prettier';

// const { parsed: cfg }: any = config();
const dirname: string = path.resolve();

interface SitesMap {
  [SiteName: string]: {
    html: string;
    cssHrefs?: string[];
    jsHrefs?: string[];
    imgHrefs?: string[];
  };
}

interface IGetFile {
  ([]: string[], res: any): Promise<string | void>;
}

const sitesMap: SitesMap = {};

const requestSite = async (
  url: string,
  args: any[],
  callback: IGetFile
): Promise<any> => {
  try {
    await new Promise((resolve, reject) => {
      needle('get', url)
        .then((body) => {
          resolve(callback(args, body) as PromiseLike<string>);
        })
        .catch((err) => reject(err));
    });
  } catch (err) {
    throw err;
  }
};

const getHtmlFile: IGetFile = async ([siteName]: string[], res) => {
  if (sitesMap[siteName]) {
    return;
  }
  try {
    const pathDirSite = path.join(dirname, 'sites', <string>siteName);

    await fs.mkdir(pathDirSite, {
      recursive: true,
    });

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

    sitesMap[siteName] = {
      html,
      cssHrefs: getCssHrefs(),
      jsHrefs: getJsHrefs(),
      imgHrefs: getImagesHrefs(),
    };
  } catch (err) {
    throw err;
  }
};

const getCssFile: IGetFile = async (
  [nameFile, pathDirLibrarry]: string[],
  res
) => {
  try {
    const pathDirCss = path.join(pathDirLibrarry, 'css');
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

async function parse(url: string) {
  const siteName: string = url.replace(/http(s|):\/\//, '');
  const pathDirSite: string = path.join(dirname, 'sites', siteName);
  const pathDirLibrarry: string = path.join(pathDirSite, 'assets');
  try {
    await requestSite(url, [siteName], getHtmlFile);
    // Взаимодействие с CSS
    sitesMap[siteName]['cssHrefs']?.forEach(async (href) => {
      const nameMatch = <RegExpMatchArray>href.match(/\/[\w-\_]+\.css/);
      if (nameMatch !== null) {
        const nameFile = nameMatch[0].replace(/\.\w+/, '').slice(1);
        await requestSite(href, [nameFile, pathDirLibrarry], getCssFile);
        const $ = cheerio.load(sitesMap[siteName]['html']);
        $(`link[href*=${nameFile}]`).attr('href', `assets/css/${nameFile}.css`);
        sitesMap[siteName]['html'] = $.html();
        //
        await fs.writeFile(
          path.join(pathDirSite, `index.html`),
          prettier.format(sitesMap[siteName]['html'], { parser: 'html' })
        );
      }
    });

    return 'Парсер отработал!';
  } catch (err) {
    throw err;
  }
}

parse('https://retro-blues.ru/').then((message) => {
  console.log(message, '\n', '');
});
