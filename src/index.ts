// import { config } from 'dotenv';
import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path, { format } from 'node:path';
import cheerio from 'cheerio';
import prettier from 'prettier';

// const { parsed: cfg }: any = config();
const dirname: string = path.resolve();

type img = {
  href?: string;
  format?: string;
};

interface SitesMap {
  [SiteName: string]: {
    cssHrefs?: string[];
    jsHrefs?: string[];
    imgHrefs?: img[];
  };
}

interface IGetFile {
  ([]: string[], data: string | Buffer, type?: string): Promise<string | void>;
}

const sitesMap: SitesMap = {};

const setHtmlFile: IGetFile = async (
  [siteName]: string[],
  data: string | Buffer
) => {
  if (sitesMap[siteName]) {
    return;
  }
  try {
    const pathDirSite = path.join(dirname, 'sites', siteName);
    await fs.mkdir(pathDirSite, {
      recursive: true,
    });
    const $ = cheerio.load(data as string);
    const formatHref = (href: string): string => {
      if (!/http(s|):\/\//.test(href)) {
        return `https://${siteName}/${href}`;
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
        if (/\.js/.test(attr['src'])) {
          jsHrefs.push(formatHref(attr['src']));
        }
      });

      return jsHrefs;
    };
    const getImagesHrefs = (): img[] => {
      const imgHrefs: img[] = [];
      $('img').each((_, el) => {
        const attr = $(el).attr();
        if (/\.[png|jpg|svg]/.test(attr['src'])) {
          imgHrefs.push({ href: formatHref(attr['src']), format: '' });
        }
      });
      return imgHrefs;
    };
    sitesMap[siteName] = {
      cssHrefs: getCssHrefs(),
      jsHrefs: getJsHrefs(),
      imgHrefs: getImagesHrefs(),
    };
    await fs.writeFile(
      path.join(pathDirSite, `index.html`),
      prettier.format(data as string, { parser: 'html' })
    );
  } catch (err) {
    throw err;
  }
};

const setLibrarryFile: IGetFile = async (
  [nameFile, pathDirLibrarry, extFile]: string[],
  data: string | Buffer,
  type?: string
) => {
  try {
    const pathDir = path.join(
      pathDirLibrarry,
      `${type === 'img' ? type : extFile}`
    );
    await fs.mkdir(pathDir, {
      recursive: true,
    });
    const dataFormated =
      extFile === 'html' || extFile === 'css'
        ? prettier.format(data as string, {
            parser: `${extFile}`,
          })
        : data;
    await fs.writeFile(
      path.join(pathDir, `${nameFile}.${extFile}`),
      dataFormated
    );
  } catch (err) {
    throw err;
  }
};

const setDynamicPathToHtml = async (
  html: string,
  hrefs: string[],
  pathDirSite: string,
  type: string,
  tag: string,
  attr: string
) => {
  try {
    const $ = cheerio.load(html);
    hrefs?.forEach((href) => {
      if (typeof href !== 'string') {
        const nameFile = getNameFile(href['href'], href['format']);
        $(`${tag}[${attr}*=${nameFile}.${href['format']}]`).attr(
          `${attr}`,
          `./assets/${type}/${nameFile}.${href['format']}`
        );
      } else {
        const nameFile = getNameFile(href, type);
        $(`${tag}[${attr}*=${nameFile}.${type}]`).attr(
          `${attr}`,
          `./assets/${type}/${nameFile}.${type}`
        );
      }
    });
    await fs.writeFile(
      path.join(pathDirSite, `index.html`),
      prettier.format($.html(), { parser: 'html' })
    );
    return $.html();
  } catch (err) {
    throw err;
  }
};

const getNameFile = (href: string, extFile: string): string | void => {
  const nameMatch = <RegExpMatchArray>(
    href.match(new RegExp(`(/[^\\/]+\\.${extFile})`))
  );
  if (nameMatch === null) {
    return;
  }
  const nameFile: string = nameMatch[0]
    .replace(new RegExp(`\.${extFile}`), '')
    .slice(1);
  return nameFile;
};

async function parse(url: string) {
  const siteName: string = url.replace(/http(s|):\/\//, '');
  const pathDirSite: string = path.join(dirname, 'sites', siteName);
  const pathDirLibrarry: string = path.join(pathDirSite, 'assets');
  try {
    // HTML
    const reqSite = await fetch(url);
    const getHtmlText = await reqSite.text();
    await setHtmlFile([siteName], getHtmlText);
    //JS
    const requestsJS: Promise<string>[] =
      sitesMap[siteName]['jsHrefs']?.map((href, idx): Promise<string> => {
        return new Promise(async (resolve, reject) => {
          try {
            const nameFile = getNameFile(href, 'js');
            if (!nameFile) {
              throw `nameFile not found! - ${href}`;
            }
            const reqSiteScript = await fetch(href);
            const getJsText = await reqSiteScript.text();
            await setLibrarryFile([nameFile, pathDirLibrarry, 'js'], getJsText);
            resolve(`[js] ${nameFile}`);
          } catch (err) {
            reject(err);
          }
        });
      }) || [];
    //CSS
    const requestsCSS: Promise<string>[] =
      sitesMap[siteName]['cssHrefs']?.map((href, idx): Promise<string> => {
        return new Promise(async (resolve, reject) => {
          try {
            const nameFile = getNameFile(href, 'css');
            if (!nameFile) {
              throw `nameFile not found! - ${href}`;
            }
            const reqSiteStyle = await fetch(href);
            const getCssText = await reqSiteStyle.text();
            await setLibrarryFile(
              [nameFile, pathDirLibrarry, 'css'],
              getCssText
            );
            resolve(`[css] ${nameFile}`);
          } catch (err) {
            reject(err);
          }
        });
      }) || [];
    // IMAGES
    const requestsImages: Promise<string>[] =
      sitesMap[siteName]['imgHrefs']?.map((img, idx): Promise<string> => {
        return new Promise(async (resolve, reject) => {
          try {
            const imgHref = img['href'] as string;
            const reqSiteImage = await fetch(imgHref);
            const getImage = await reqSiteImage.arrayBuffer();
            let formatImage = <string>reqSiteImage.headers.get('content-type');
            formatImage = formatImage.replace(/image\//, '');
            formatImage = formatImage === 'jpeg' ? 'jpg' : formatImage;
            const nameFile = getNameFile(imgHref, formatImage);
            if (!nameFile) {
              throw `nameFile not found! - ${imgHref}`;
            }
            const bufferImage = Buffer.from(getImage);
            await setLibrarryFile(
              [nameFile, pathDirLibrarry, formatImage],
              bufferImage,
              'img'
            );
            const currentImage = sitesMap[siteName]['imgHrefs']?.find(
              (el) => el.href === imgHref
            ) as img;
            currentImage['format'] = formatImage;

            resolve(`[${formatImage}] ${nameFile}`);
          } catch (err) {
            reject(err);
          }
        });
      }) || [];
    return {
      html: getHtmlText,
      sitesMap,
      siteName,
      pathDirSite,
      requestsJS,
      requestsCSS,
      requestsImages,
    };
  } catch (err) {
    throw err;
  }
}

parse('https://permweb.ru/').then(async (data) => {
  const {
    html,
    sitesMap,
    siteName,
    pathDirSite,
    requestsJS,
    requestsCSS,
    requestsImages,
  } = data;
  const requests = await Promise.allSettled([
    ...requestsJS,
    ...requestsCSS,
    ...requestsImages,
  ]);
  console.log(requests);
  const htmlDynamicJS = await setDynamicPathToHtml(
    html,
    <[]>sitesMap[siteName]['jsHrefs'],
    pathDirSite,
    'js',
    'script',
    'src'
  );
  const htmlDynamicCss = await setDynamicPathToHtml(
    htmlDynamicJS,
    <[]>sitesMap[siteName]['cssHrefs'],
    pathDirSite,
    'css',
    'link',
    'href'
  );
  await setDynamicPathToHtml(
    htmlDynamicCss,
    <[]>sitesMap[siteName]['imgHrefs'],
    pathDirSite,
    'img',
    'img',
    'src'
  );
});
