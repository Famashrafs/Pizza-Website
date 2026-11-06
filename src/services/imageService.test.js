process.env.REACT_APP_FIREBASE_PROJECT_ID = 'resturent-system';
process.env.REACT_APP_FIREBASE_STORAGE_BUCKET =
  'resturent-system.firebasestorage.app';

jest.mock('firebase/storage', () => ({
  deleteObject: jest.fn(async () => undefined),
  getDownloadURL: jest.fn(async () => 'https://example.test/download.jpg'),
  getStorage: jest.fn(() => ({ name: 'mock-storage' })),
  ref: jest.fn((_storage, path) => ({ path })),
  refFromURL: jest.fn((_storage, url) => ({ url })),
  uploadBytesResumable: jest.fn(),
}));

jest.mock('../firebase', () => ({
  __esModule: true,
  default: { name: 'mock-app' },
}));

const storage = require('firebase/storage');
const imageService = require('./imageService');

function successfulTask() {
  return {
    snapshot: { ref: { name: 'snapshot-ref' } },
    cancel: jest.fn(),
    on: jest.fn((_event, next, _error, complete) => {
      next({ totalBytes: 100, bytesTransferred: 50 });
      complete({ ref: { name: 'snapshot-ref' } });
      return jest.fn();
    }),
  };
}

describe('imageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.getStorage.mockReturnValue({ name: 'mock-storage' });
    storage.ref.mockImplementation((_storage, path) => ({ path }));
    storage.refFromURL.mockImplementation((_storage, url) => ({ url }));
    storage.deleteObject.mockResolvedValue(undefined);
    storage.uploadBytesResumable.mockReturnValue(successfulTask());
    storage.getDownloadURL.mockResolvedValue(
      'https://firebasestorage.googleapis.com/v0/b/resturent-system.firebasestorage.app/o/new.jpg'
    );
  });

  test('uses the existing project bucket and rejects a different bucket', () => {
    expect(imageService.getExpectedStorageBucketName()).toBe(
      'resturent-system.firebasestorage.app'
    );
    expect(imageService.getConfiguredStorageBucketName()).toBe(
      'resturent-system.firebasestorage.app'
    );
    expect(imageService.isImageStorageConfigured()).toBe(true);

    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = 'another-project.appspot.com';
    expect(imageService.isImageStorageConfigured()).toBe(false);
    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET =
      'resturent-system.firebasestorage.app';
  });

  test('builds owner-scoped product, branding, and profile paths', () => {
    const file = { type: 'image/jpeg' };
    const productPath = imageService.buildImageObjectPath({
      kind: imageService.IMAGE_KINDS.PRODUCT,
      ownerUid: 'owner-1',
      restaurantId: 'restaurant-1',
      file,
    });
    const logoPath = imageService.buildImageObjectPath({
      kind: imageService.IMAGE_KINDS.RESTAURANT_LOGO,
      ownerUid: 'owner-1',
      restaurantId: 'restaurant-1',
      file,
    });
    const profilePath = imageService.buildImageObjectPath({
      kind: imageService.IMAGE_KINDS.CUSTOMER_PROFILE,
      ownerUid: 'customer-1',
      file,
    });

    expect(productPath).toMatch(
      /^products\/restaurant-1\/owner-1\/[a-zA-Z0-9-]+\.jpg$/
    );
    expect(logoPath).toMatch(
      /^restaurants\/restaurant-1\/branding\/logo\/owner-1\/[a-zA-Z0-9-]+\.jpg$/
    );
    expect(profilePath).toMatch(
      /^users\/customer-1\/profile\/[a-zA-Z0-9-]+\.jpg$/
    );
  });

  test('uploads with a scoped ref and retrieves the download URL', async () => {
    const file = { type: 'image/png', size: 100, name: 'photo.png' };
    const progress = jest.fn();

    const uploaded = await imageService.uploadImageAsset(file, {
      kind: imageService.IMAGE_KINDS.PRODUCT,
      ownerUid: 'owner-1',
      restaurantId: 'restaurant-1',
      onProgress: progress,
    });

    expect(storage.ref).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^products\/restaurant-1\/owner-1\//)
    );
    expect(storage.uploadBytesResumable).toHaveBeenCalledWith(
      expect.anything(),
      file,
      { contentType: 'image/png' }
    );
    expect(storage.getDownloadURL).toHaveBeenCalledWith({
      name: 'snapshot-ref',
    });
    expect(progress).toHaveBeenCalledWith(50);
    expect(uploaded.url).toContain('/resturent-system.firebasestorage.app/');
  });

  test('removes the new object when download-URL retrieval fails', async () => {
    storage.getDownloadURL.mockRejectedValueOnce(new Error('URL failed'));
    const file = { type: 'image/webp', size: 100, name: 'photo.webp' };

    await expect(
      imageService.uploadImageAsset(file, {
        kind: imageService.IMAGE_KINDS.CUSTOMER_PROFILE,
        ownerUid: 'customer-1',
      })
    ).rejects.toThrow('URL failed');

    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  test('deletes a configured-bucket object with refFromURL', async () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/resturent-system.firebasestorage.app/o/products%2Frestaurant-1%2Fowner-1%2Fold.jpg?token=abc';

    await expect(imageService.deleteImage(url)).resolves.toBe(true);

    expect(storage.refFromURL).toHaveBeenCalledWith(expect.anything(), url);
    expect(storage.deleteObject).toHaveBeenCalledWith({ url });
  });

  test('never tries to delete an image from another bucket', async () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/another-project.appspot.com/o/photo.jpg?token=abc';

    await expect(imageService.deleteImage(url)).resolves.toBe(false);

    expect(storage.refFromURL).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
