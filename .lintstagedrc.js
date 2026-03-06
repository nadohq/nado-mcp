import path from 'path';

/**
 * @type {import('lint-staged').Configuration}
 */
const config = {
  '**/*.(ts|js)': (filenames) => {
    const relativeFiles = filenames.map((f) =>
      path.relative(path.resolve('.'), f),
    );
    return [
      `bun typecheck`,
      `bun eslint --cache --fix ${relativeFiles.join(' ')}`,
      `bun prettier --write ${relativeFiles.join(' ')}`,
    ];
  },

  '**/*.(json)': (filenames) => {
    const relativeFiles = filenames.map((f) =>
      path.relative(path.resolve('.'), f),
    );
    return [`bun prettier --write ${relativeFiles.join(' ')}`];
  },
};

export default config;
