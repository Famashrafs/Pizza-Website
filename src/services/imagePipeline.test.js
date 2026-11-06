process.env.REACT_APP_FIREBASE_PROJECT_ID = 'resturent-system';
process.env.REACT_APP_FIREBASE_STORAGE_BUCKET =
  'resturent-system.firebasestorage.app';

jest.mock('../firebase', () => ({
  __esModule: true,
  default: { name: 'mock-app' },
}));

const { commitImagePipeline } = require('./imagePipeline');

describe('commitImagePipeline', () => {
  test('uploads, saves the URL, then removes the old image in that order', async () => {
    const events = [];
    const cleanup = jest.fn(async (url) => {
      events.push(`delete:${url}`);
      return true;
    });
    const upload = jest.fn(async () => {
      events.push('upload');
      return { url: 'https://example.test/new.jpg' };
    });
    const save = jest.fn(async (values) => {
      events.push(`save:${values.image}`);
      return { success: true };
    });

    const result = await commitImagePipeline({
      changes: [
        {
          key: 'image',
          upload,
          oldUrl: 'https://example.test/old.jpg',
        },
      ],
      save,
      cleanup,
    });

    expect(result.values.image).toBe('https://example.test/new.jpg');
    expect(events).toEqual([
      'upload',
      'save:https://example.test/new.jpg',
      'delete:https://example.test/old.jpg',
    ]);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith('https://example.test/old.jpg');
  });

  test('deletes a newly uploaded image when the Firestore save fails', async () => {
    const cleanup = jest.fn(async () => true);
    const upload = jest.fn(async () => ({ url: 'https://example.test/new.jpg' }));
    const save = jest.fn(async () => ({ success: false, error: 'write denied' }));

    await expect(
      commitImagePipeline({
        changes: [
          {
            key: 'image',
            upload,
            oldUrl: 'https://example.test/old.jpg',
          },
        ],
        save,
        cleanup,
      })
    ).rejects.toThrow('write denied');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith('https://example.test/new.jpg');
    expect(cleanup).not.toHaveBeenCalledWith('https://example.test/old.jpg');
  });

  test('cleans up earlier uploads when a later upload fails', async () => {
    const cleanup = jest.fn(async () => true);
    const uploadError = new Error('second upload failed');

    await expect(
      commitImagePipeline({
        changes: [
          {
            key: 'logo',
            upload: async () => ({ url: 'https://example.test/logo.jpg' }),
          },
          {
            key: 'cover',
            upload: async () => {
              throw uploadError;
            },
          },
        ],
        save: jest.fn(),
        cleanup,
      })
    ).rejects.toThrow('second upload failed');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith('https://example.test/logo.jpg');
  });

  test('does not delete a pasted URL when saving it fails', async () => {
    const cleanup = jest.fn(async () => true);

    await expect(
      commitImagePipeline({
        changes: [
          {
            key: 'image',
            value: 'https://external.test/pasted.jpg',
            oldUrl: 'https://example.test/old.jpg',
          },
        ],
        save: async () => ({ success: false }),
        cleanup,
      })
    ).rejects.toThrow();

    expect(cleanup).not.toHaveBeenCalled();
  });

  test('keeps the successful Firestore save when old-image cleanup fails', async () => {
    const cleanup = jest.fn(async () => {
      throw new Error('delete denied');
    });

    const result = await commitImagePipeline({
      changes: [
        {
          key: 'image',
          value: 'https://example.test/new.jpg',
          oldUrl: 'https://example.test/old.jpg',
        },
      ],
      save: async () => ({ success: true }),
      cleanup,
    });

    expect(result.saved).toEqual({ success: true });
    expect(result.cleanupResults[0].removed).toBe(false);
  });
});
