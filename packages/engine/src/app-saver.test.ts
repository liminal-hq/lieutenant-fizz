// Tests for the app's file saver, with the Tauri plugins replaced by fakes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { openAppSaver, type AppDeps } from './app-saver';

const bytes = Uint8Array.from([1, 2, 3]);

function deps(over: Partial<AppDeps> = {}) {
  const calls: string[] = [];
  const written: [string, Uint8Array][] = [];
  const d: AppDeps = {
    pickOpenPath: async (extensions) => {
      calls.push(`open ${extensions.join(',')}`);
      return '/home/me/Downloads/fizz-session-abc.zip';
    },
    readFile: async (path) => {
      calls.push(`read ${path}`);
      return bytes;
    },
    pickSavePath: async (name) => {
      calls.push(`pick ${name}`);
      return `/home/me/Downloads/${name}`;
    },
    writeFile: async (path, data) => {
      calls.push(`write ${path}`);
      written.push([path, data]);
    },
    sharePath: async (name) => {
      calls.push(`sharePath ${name}`);
      return `/cache/fizz-share/${name}`;
    },
    canShare: async () => ({ supported: true, files: true }),
    shareFile: async (options) => {
      calls.push(`share ${options.path} ${options.mime} ${options.title}`);
      return { status: 'shared' };
    },
    ...over,
  };
  return { d, calls, written };
}

describe('openAppSaver save', () => {
  it('opens the Save dialog with the file name and writes the bytes where the player chose', async () => {
    const { d, calls, written } = deps();
    const saver = await openAppSaver(d);
    expect(await saver.save(bytes, 'fizz-session-x.zip', 'application/zip')).toBe('saved');
    expect(calls).toEqual([
      'pick fizz-session-x.zip',
      'write /home/me/Downloads/fizz-session-x.zip',
    ]);
    expect(written[0]![1]).toEqual(bytes);
  });

  it('says cancelled, and writes nothing, when the dialog is closed', async () => {
    const { d, written } = deps({ pickSavePath: async () => null });
    const saver = await openAppSaver(d);
    expect(await saver.save(bytes, 'x.zip', 'application/zip')).toBe('cancelled');
    expect(written).toEqual([]);
  });

  it('says failed when the dialog or the write fails', async () => {
    const dialog = await openAppSaver(
      deps({
        pickSavePath: async () => {
          throw new Error('no dialog');
        },
      }).d,
    );
    expect(await dialog.save(bytes, 'x.zip', 'application/zip')).toBe('failed');
    const write = await openAppSaver(
      deps({
        writeFile: async () => {
          throw new Error('disk full');
        },
      }).d,
    );
    expect(await write.save(bytes, 'x.zip', 'application/zip')).toBe('failed');
  });
});

describe('openAppSaver share', () => {
  it('writes the zip to the cache and hands that path to the share sheet', async () => {
    const { d, calls, written } = deps();
    const saver = await openAppSaver(d);
    expect(await saver.share(bytes, 'fizz-session-x.zip', 'application/zip')).toBe('shared');
    expect(calls).toEqual([
      'sharePath fizz-session-x.zip',
      'write /cache/fizz-share/fizz-session-x.zip',
      'share /cache/fizz-share/fizz-session-x.zip application/zip fizz-session-x.zip',
    ]);
    expect(written[0]![1]).toEqual(bytes);
  });

  it('passes on what the system says: cancelled, or nothing more', async () => {
    for (const status of ['cancelled', 'unknown'] as const) {
      const saver = await openAppSaver(deps({ shareFile: async () => ({ status }) }).d);
      expect(await saver.share(bytes, 'x.zip', 'application/zip')).toBe(status);
    }
  });

  it('says failed when the file cannot be written or the share sheet rejects', async () => {
    const write = await openAppSaver(
      deps({
        writeFile: async () => {
          throw new Error('no space');
        },
      }).d,
    );
    expect(await write.share(bytes, 'x.zip', 'application/zip')).toBe('failed');
    const reject = await openAppSaver(
      deps({
        shareFile: async () => {
          throw Object.assign(new Error('nope'), { code: 'unsupported' });
        },
      }).d,
    );
    expect(await reject.share(bytes, 'x.zip', 'application/zip')).toBe('failed');
  });
});

describe('openAppSaver canShare', () => {
  it('is true only where the share sheet exists and takes a file', async () => {
    expect((await openAppSaver(deps().d)).canShare('x.zip', 'application/zip')).toBe(true);
    expect(
      (
        await openAppSaver(deps({ canShare: async () => ({ supported: true, files: false }) }).d)
      ).canShare('x.zip', 'application/zip'),
    ).toBe(false);
    expect(
      (
        await openAppSaver(deps({ canShare: async () => ({ supported: false, files: false }) }).d)
      ).canShare('x.zip', 'application/zip'),
    ).toBe(false);
  });

  it('is false, and Save still works, when asking fails', async () => {
    const saver = await openAppSaver(
      deps({
        canShare: async () => {
          throw new Error('plugin missing');
        },
      }).d,
    );
    expect(saver.canShare('x.zip', 'application/zip')).toBe(false);
    expect(await saver.save(bytes, 'x.zip', 'application/zip')).toBe('saved');
  });
});

describe('openAppSaver open', () => {
  it('opens the Open dialog for zips, reads the one file chosen, and gives its name', async () => {
    const { d, calls } = deps();
    const saver = await openAppSaver(d);
    expect(await saver.open(['zip'])).toEqual({
      status: 'opened',
      name: 'fizz-session-abc.zip',
      bytes,
    });
    expect(calls).toEqual(['open zip', 'read /home/me/Downloads/fizz-session-abc.zip']);
  });

  it('names a file from the address Android’s picker gives, decoded', async () => {
    const saver = await openAppSaver(
      deps({
        pickOpenPath: async () => 'content://docs/document/primary%3ADownload%2Ffizz%20one.zip',
      }).d,
    );
    const got = await saver.open(['zip']);
    expect(got.status === 'opened' && got.name).toBe('fizz one.zip');
  });

  it('says nothing when the dialog is closed, and says so when the dialog or the read fails', async () => {
    const closed = await openAppSaver(deps({ pickOpenPath: async () => null }).d);
    expect(await closed.open(['zip'])).toEqual({ status: 'cancelled' });
    const noDialog = await openAppSaver(
      deps({
        pickOpenPath: async () => {
          throw new Error('no dialog');
        },
      }).d,
    );
    expect(await noDialog.open(['zip'])).toEqual({ status: 'failed' });
    const noRead = await openAppSaver(
      deps({
        readFile: async () => {
          throw new Error('not allowed');
        },
      }).d,
    );
    expect(await noRead.open(['zip'])).toEqual({ status: 'failed' });
  });
});
