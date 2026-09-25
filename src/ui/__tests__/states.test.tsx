import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  EmptyState,
  ErrorState,
  ForecastValue,
  InlineNotice,
  LoadingState,
  OfflineBanner,
  VerificationBadge,
  verificationLabel,
} from '@/ui';

describe('verification vocabulary', () => {
  it('uses the three approved, distinct labels', () => {
    const labels = [
      verificationLabel('verified'),
      verificationLabel('pending'),
      verificationLabel('unable_to_verify'),
    ];
    expect(labels).toEqual(['מאומת', 'חסר מידע / ממתין לאימות', 'לא ניתן לאמת']);
    expect(new Set(labels).size).toBe(3);
  });

  it('renders a badge per state', async () => {
    await render(
      <>
        <VerificationBadge state="verified" />
        <VerificationBadge state="pending" />
        <VerificationBadge state="unable_to_verify" />
      </>,
    );
    // The icon glyph renders as a leading text character; assert the label ends the content.
    const endsWith = (s: string) => new RegExp(`${s}$`);
    expect(screen.getByTestId('verification-verified')).toHaveTextContent(endsWith('מאומת'));
    expect(screen.getByTestId('verification-pending')).toHaveTextContent(
      endsWith('חסר מידע / ממתין לאימות'),
    );
    expect(screen.getByTestId('verification-unable_to_verify')).toHaveTextContent(
      endsWith('לא ניתן לאמת'),
    );
  });
});

describe('ForecastValue', () => {
  it('is always labeled צפי', async () => {
    await render(<ForecastValue value="מרץ 2027" testID="fc" />);
    expect(screen.getByTestId('fc')).toHaveTextContent(/צפי/);
    expect(screen.getByLabelText('צפי: מרץ 2027')).toBeTruthy();
  });
});

describe('state components', () => {
  it('loading state is announced as busy', async () => {
    await render(<LoadingState message="מחפש מקורות רשמיים…" />);
    expect(screen.getByLabelText('מחפש מקורות רשמיים…')).toBeTruthy();
  });

  it('empty state offers a next action', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="אין טיפולים" action={{ label: 'הוספת טיפול', onPress }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'הוספת טיפול' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('error state offers a corrective action', async () => {
    const onPress = jest.fn();
    await render(<ErrorState message="הסריקה נכשלה" action={{ label: 'נסה שוב', onPress }} />);
    expect(screen.getByText('הסריקה נכשלה')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'נסה שוב' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('offline banner explains what resumes later', async () => {
    await render(<OfflineBanner pendingMessage="העלאת החשבונית תושלם כשהחיבור יחזור" />);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/העלאת החשבונית/);
  });

  it('inline notice renders its action', async () => {
    await render(
      <InlineNotice
        tone="warning"
        message="קריאת מד האוץ ישנה"
        action={{ label: 'עדכון', onPress: () => {} }}
      />,
    );
    expect(screen.getByRole('button', { name: 'עדכון' })).toBeTruthy();
  });
});
