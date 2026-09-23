import { EMERGENCY_MESSAGE_MAX } from '@doch1/shared';
import { useEffect, useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { emergency as t } from '../../i18n/he';
import { font, radius, space, type } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { Banner } from '../Banner';
import { PillButton } from '../PillButton';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';

/** F10 confirm dialog: group + include subgroups + optional message → start. */
export function EmergencyConfirm({
  visible,
  groupName,
  defaultIncludeSub,
  loading,
  error,
  onCancel,
  onStart,
}: {
  visible: boolean;
  groupName: string;
  defaultIncludeSub: boolean;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (v: { includeSub: boolean; message?: string }) => void;
}) {
  const [includeSub, setIncludeSub] = useState(defaultIncludeSub);
  const [message, setMessage] = useState('');
  const s = useStyles();
  const { c } = useTheme();
  useEffect(() => {
    if (!visible) return;
    setIncludeSub(defaultIncludeSub);
    setMessage('');
  }, [visible, defaultIncludeSub]);

  return (
    <Sheet visible={visible} onClose={onCancel} title={t.confirmTitle}>
      <Txt variant="body">{t.confirmBody(groupName)}</Txt>
      <View style={s.row}>
        <Txt variant="body" style={s.flex}>
          {t.includeSub}
        </Txt>
        <Switch
          value={includeSub}
          onValueChange={setIncludeSub}
          accessibilityLabel={t.includeSub}
          trackColor={{ true: c.status.present, false: c.border.subtle }}
        />
      </View>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={t.messageLabel}
        placeholderTextColor={c.text.disabled}
        accessibilityLabel={t.messageLabel}
        maxLength={EMERGENCY_MESSAGE_MAX}
        multiline
        style={s.input}
      />
      {error ? <Banner kind="danger" text={error} /> : null}
      <PillButton
        label={t.start}
        variant="danger"
        loading={loading}
        onPress={() => onStart({ includeSub, message: message.trim() || undefined })}
      />
      <PillButton label={t.cancel} variant="ghost" onPress={onCancel} />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  flex: { flex: 1 },
  input: {
    ...type.body,
    fontFamily: font.regular,
    color: c.text.primary,
    minHeight: 72,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: radius.card,
    backgroundColor: c.surface.base,
    padding: space.md,
    textAlign: 'right',
    textAlignVertical: 'top',
  },
}));
