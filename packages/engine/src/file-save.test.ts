// Tests for the web file saver: a download link, and the share sheet where the browser has one.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { webSaver, type WebSaverEnv } from './file-save';

function setup(nav: WebSaverEnv['navigator'] = {}, failClick = false) {
  const log: string[] = [];
  const timers: (() => void)[] = [];
  const link = {
    href: '',
    download: '',
    rel: '',
    click() {
      if (failClick) throw new Error('blocked');
      log.push(`click ${link.download} ${link.href}`);
    },
  };
  const env: WebSaverEnv = {
    document: {
      createElement: () => link,
      body: {
        appendChild: () => log.push('append'),
        removeChild: () => log.push('remove'),
      },
    },
    URL: {
      createObjectURL: (b) => {
        log.push(`url ${b.size} ${b.type}`);
        return 'blob:abc';
      },
      revokeObjectURL: (u) => void log.push(`revoke ${u}`),
    },
    navigator: nav,
    File,
    setTimeout: (fn) => timers.push(fn),
  };
  return { saver: webSaver(env), log, timers };
}

const bytes = Uint8Array.from([1, 2, 3, 4]);

describe('webSaver.save', () => {
  it('downloads through a link with the file name, then frees the address later', async () => {
    const { saver, log, timers } = setup();
    expect(await saver.save(bytes, 'fizz-session-x.zip', 'application/zip')).toBe('saved');
    expect(log).toEqual([
      'url 4 application/zip',
      'append',
      'click fizz-session-x.zip blob:abc',
      'remove',
    ]);
    timers.forEach((t) => t());
    expect(log.at(-1)).toBe('revoke blob:abc');
  });

  it('says so when the browser will not let it click', async () => {
    const { saver } = setup({}, true);
    expect(await saver.save(bytes, 'x.zip', 'application/zip')).toBe('failed');
  });
});

describe('webSaver.open', () => {
  const openWith = (pick?: WebSaverEnv['pickFile']) => {
    const { saver } = setup();
    return (
      webSaver({
        document: {
          createElement: () => ({ href: '', download: '', rel: '', click() {} }),
          body: { appendChild() {}, removeChild() {} },
        },
        URL: { createObjectURL: () => '', revokeObjectURL() {} },
        navigator: {},
        File,
        setTimeout: () => 0,
        ...(pick ? { pickFile: pick } : {}),
      }) ?? saver
    );
  };

  it('asks the picker for the extensions, and reads the file chosen', async () => {
    let asked = '';
    const saver = openWith(async (accept) => {
      asked = accept;
      return new File([bytes as BlobPart], 'fizz-session-x.zip');
    });
    const got = await saver.open(['zip']);
    expect(asked).toBe('.zip');
    expect(got).toEqual({ status: 'opened', name: 'fizz-session-x.zip', bytes });
  });

  it('turns a file larger than the limit away without reading it', async () => {
    const big = new File([bytes as BlobPart], 'big.zip');
    big.arrayBuffer = async () => {
      throw new Error('read a file that is too large');
    };
    const saver = openWith(async () => big);
    expect(await saver.open(['zip'], bytes.length - 1)).toEqual({ status: 'toolarge' });
    // At the limit, or with none given, it is read.
    expect(
      (
        await openWith(async () => new File([bytes as BlobPart], 'a.zip')).open(
          ['zip'],
          bytes.length,
        )
      ).status,
    ).toBe('opened');
  });

  it('is cancelled when the picker is closed, and failed when there is no picker or it breaks', async () => {
    expect(await openWith(async () => null).open(['zip'])).toEqual({ status: 'cancelled' });
    expect(await openWith().open(['zip'])).toEqual({ status: 'failed' });
    const broken = openWith(async () => {
      throw new Error('blocked');
    });
    expect(await broken.open(['zip'])).toEqual({ status: 'failed' });
  });
});

describe('webSaver.canShare and share', () => {
  it('cannot share where the browser has no share or no file sharing', () => {
    expect(setup({}).saver.canShare('x.zip', 'application/zip')).toBe(false);
    expect(setup({ share: async () => {} }).saver.canShare('x.zip', 'application/zip')).toBe(false);
    expect(
      setup({ share: async () => {}, canShare: () => false }).saver.canShare(
        'x.zip',
        'application/zip',
      ),
    ).toBe(false);
  });

  it('can share where the browser says it can share a file', () => {
    const nav = { share: async () => {}, canShare: () => true };
    expect(setup(nav).saver.canShare('x.zip', 'application/zip')).toBe(true);
  });

  it('shares the file with its name, and reports it shared', async () => {
    let sent: { files: File[]; title?: string } | undefined;
    const { saver } = setup({
      share: async (d) => {
        sent = d;
      },
      canShare: () => true,
    });
    expect(await saver.share(bytes, 'x.zip', 'application/zip')).toBe('shared');
    expect(sent?.files[0]?.name).toBe('x.zip');
    expect(sent?.files[0]?.size).toBe(4);
  });

  it('reports closing the sheet as cancelled and anything else as failed', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    expect(
      await setup({
        share: async () => {
          throw abort;
        },
      }).saver.share(bytes, 'x.zip', 'application/zip'),
    ).toBe('cancelled');
    expect(
      await setup({
        share: async () => {
          throw new Error('no');
        },
      }).saver.share(bytes, 'x.zip', 'application/zip'),
    ).toBe('failed');
  });
});
