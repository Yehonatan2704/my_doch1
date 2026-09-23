// Sick-note picking + upload (F3). Camera or file; the server checks type by magic bytes, strips
// EXIF and stores it privately — the client only sends the file.
import { ALLOWED_MIME } from '@doch1/shared';
import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from './api';

export type Picked = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  file?: File; // web only
};

export async function pickFile(): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [...ALLOWED_MIME],
    multiple: false,
    copyToCacheDirectory: true,
  });
  const a = res.canceled ? null : res.assets[0];
  return a ? { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, file: a.file } : null;
}

/** 'denied' when the user refused camera access (the screen offers "choose file" instead). */
export async function takePhoto(): Promise<Picked | null | 'denied'> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return 'denied';
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    exif: false,
  });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  return {
    uri: a.uri,
    name: a.fileName ?? 'photo.jpg',
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize,
    file: a.file,
  };
}

/** Camera capture is offered on phones only; web gets "choose file". */
export const canUseCamera = Platform.OS !== 'web';

function toForm(p: Picked): FormData {
  const form = new FormData();
  if (Platform.OS === 'web') {
    if (!p.file) throw new Error('missing web file');
    form.append('file', p.file, p.name);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor for files.
    form.append('file', {
      uri: p.uri,
      name: p.name,
      type: p.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
  }
  return form; // multipart field name `file` (SPEC §9 row 15)
}

/** POST /documents → documentId. */
export function useUploadDocument() {
  return useMutation({
    mutationFn: async (p: Picked) => (await api.uploadDocument(toForm(p))).documentId,
  });
}
