import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  SegmentedControl,
  TextField,
  touchTarget,
} from '@/ui';

describe('Button', () => {
  it('fires onPress and exposes button role', async () => {
    const onPress = jest.fn();
    await render(<Button label="שמירה" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'שמירה' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled or loading, and reports state', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="א" onPress={onPress} disabled />
        <Button label="ב" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'א' }));
    await fireEvent.press(screen.getByRole('button', { name: 'ב' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'א' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ב' })).toBeBusy();
  });

  it('meets the minimum touch target', async () => {
    await render(<Button label="המשך" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'המשך' })).toHaveStyle({ minHeight: touchTarget });
  });
});

describe('Checkbox', () => {
  function Harness() {
    const [checked, setChecked] = useState(false);
    return <Checkbox checked={checked} onChange={setChecked} label="החלפת שמן מנוע" />;
  }

  it('toggles performed state and exposes checkbox semantics', async () => {
    await render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'החלפת שמן מנוע' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(box).toBeChecked();
  });
});

describe('TextField', () => {
  it('labels optional fields and surfaces errors', async () => {
    await render(
      <TextField
        label="מוסך"
        value=""
        onChangeText={() => {}}
        error="שדה לא תקין"
        testID="garage"
      />,
    );
    expect(screen.getByLabelText('מוסך (רשות)')).toBeTruthy();
    expect(screen.getByText('שדה לא תקין')).toBeTruthy();
  });

  it('does not add optional marker to required fields', async () => {
    await render(<TextField label="תאריך" value="" onChangeText={() => {}} required />);
    expect(screen.getByLabelText('תאריך')).toBeTruthy();
  });
});

describe('SegmentedControl', () => {
  it('selects a single option', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        accessibilityLabel="סוג פעולה"
        value="inspection"
        onChange={onChange}
        options={[
          { value: 'inspection', label: 'בדיקה' },
          { value: 'replacement', label: 'החלפה' },
          { value: 'other', label: 'פעולה אחרת' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'בדיקה' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'החלפה' }));
    expect(onChange).toHaveBeenCalledWith('replacement');
  });
});

describe('Dialog', () => {
  it('confirms and cancels explicitly', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <Dialog
        visible
        title="מחיקה לצמיתות"
        message="לא ניתן לבטל פעולה זו"
        confirmLabel="מחק לצמיתות"
        onConfirm={onConfirm}
        onCancel={onCancel}
        destructive
        testID="dlg"
      />,
    );
    await fireEvent.press(screen.getByTestId('dlg-confirm'));
    await fireEvent.press(screen.getByTestId('dlg-cancel'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Card and Badge', () => {
  it('pressable card is a button', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} accessibilityLabel="טיפול הבא">
        <Badge label="בקרוב" tone="warning" />
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'טיפול הבא' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('בקרוב')).toBeTruthy();
  });
});
