import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

/** Onboarding entry: first-run welcome → "add first vehicle" → identification method → continue. */
async function chooseMethod(method: 'onboarding-start-scan' | 'onboarding-manual') {
  if (screen.queryByTestId('onboarding-add-first')) {
    await fireEvent.press(screen.getByTestId('onboarding-add-first'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-method')).toBeOnTheScreen());
  }
  await fireEvent.press(screen.getByTestId(method));
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
}

const LONG = { timeout: 8000 };

async function openOnboarding() {
  await renderRouter('./src/app', { initialUrl: '/onboarding' });
  // Vehicles already exist in the demo data: adding one opens the identification method directly.
  await waitFor(() => expect(screen.getByTestId('screen-onboarding-method')).toBeOnTheScreen());
}

async function goToScanWithScenario(label: RegExp) {
  await chooseMethod('onboarding-start-scan');
  await waitFor(() => expect(screen.getByTestId('screen-onboarding-scan')).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('radio', { name: label }));
  await fireEvent.press(screen.getByTestId('scan-capture'));
}

describe('onboarding flow (mock scenarios)', () => {
  it('scan → confirm → odometer → verified source → Home with the new vehicle active', async () => {
    await openOnboarding();
    await goToScanWithScenario(/זיהוי מלא/);

    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.queryByTestId('missing-fields')).toBeNull();
    // Sensitive identifier is masked: only the last four VIN characters are shown.
    expect(screen.getByTestId('field-vin')).toHaveTextContent(/0001/);
    expect(screen.getByTestId('field-vin')).not.toHaveTextContent(/JM1BP/);
    expect(screen.getByTestId('field-kind')).toHaveTextContent(/זוהה מרישיון הרכב/);

    await fireEvent.press(screen.getByTestId('confirm-details'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-odometer')).toBeOnTheScreen());
    expect(screen.getByTestId('odometer-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '42,300');
    await fireEvent.press(screen.getByTestId('odometer-continue'));

    await waitFor(() => expect(screen.getByTestId('screen-onboarding-sources')).toBeOnTheScreen());
    await waitFor(
      () => expect(screen.getByTestId('sources-result-verified')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('sources-finish'));

    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen());
    expect(screen.getByTestId('vehicle-hero')).toHaveTextContent(/מאזדה 3/);
    expect(screen.getByTestId('vehicle-hero')).toHaveTextContent(/2020/);
    expect(screen.getByTestId('home-odometer-card')).toHaveTextContent(/42,300/);
  }, 60000);

  it('failed scan stays in context and offers retry / manual entry', async () => {
    await openOnboarding();
    await goToScanWithScenario(/סריקה נכשלה/);
    await waitFor(() => expect(screen.getByTestId('identify-failed')).toBeOnTheScreen(), LONG);
    expect(screen.getByRole('button', { name: 'סריקה חוזרת' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'הזנה ידנית' }));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen());
    expect(screen.getByTestId('manual-continue')).toBeDisabled();
  }, 20000);

  it('ambiguous identification requires the user to choose (no guessing)', async () => {
    await openOnboarding();
    await goToScanWithScenario(/כמה התאמות/);
    await waitFor(() => expect(screen.getByTestId('candidate-1')).toBeOnTheScreen(), LONG);
    expect(screen.queryByTestId('screen-onboarding-confirm')).toBeNull();
    await fireEvent.press(screen.getByTestId('candidate-1'));
    await waitFor(() => expect(screen.getByTestId('field-model')).toHaveTextContent(/Joymax Z\+/));
  }, 20000);

  it('partial identification asks only for the missing field', async () => {
    await openOnboarding();
    await goToScanWithScenario(/זיהוי חלקי/);
    await waitFor(() => expect(screen.getByTestId('missing-fields')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('input-engine')).toBeOnTheScreen();
    expect(screen.queryByTestId('input-manufacturer')).toBeNull();
    expect(screen.queryByTestId('input-registration')).toBeNull();
    expect(screen.getByTestId('confirm-details')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('input-engine'), '650 סמ״ק');
    expect(screen.getByTestId('confirm-details')).toBeEnabled();
  }, 20000);

  it('no verifiable source: clearly stated, no schedule invented', async () => {
    await openOnboarding();
    await goToScanWithScenario(/זיהוי מלא/);
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('confirm-details'));
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '1000');
    await fireEvent.press(screen.getByTestId('odometer-continue'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-sources')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('radio', { name: /לא נמצא/ }));
    await waitFor(
      () => expect(screen.getByTestId('sources-result-notFound')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('sources-result-notFound')).toHaveTextContent(
      /לא נציג המלצות תחזוקה מקצועיות ללא מקור מאומת/,
    );
  }, 30000);
});
