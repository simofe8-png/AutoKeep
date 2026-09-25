import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

async function renderApp() {
  await renderRouter('./src/app', { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
}

describe('navigation shell', () => {
  it('renders exactly four primary tabs in the approved order with Hebrew labels', async () => {
    await renderApp();
    const ids = ['tab-home', 'tab-maintenance', 'tab-history', 'tab-documents'];
    const labels = ids.map((id) => screen.getByTestId(id).props.accessibilityLabel);
    expect(labels).toEqual(['בית', 'תחזוקה', 'היסטוריה', 'מסמכים']);
    expect(screen.queryByTestId('tab-alerts')).toBeNull();
    expect(screen.queryByTestId('tab-settings')).toBeNull();
  });

  it('switches between tabs', async () => {
    await renderApp();
    await fireEvent.press(screen.getByTestId('tab-documents'));
    await waitFor(() => expect(screen.getByTestId('screen-documents')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-maintenance'));
    await waitFor(() => expect(screen.getByTestId('screen-maintenance')).toBeOnTheScreen());
  });

  it('opens alerts and settings as secondary entries and returns back', async () => {
    await renderApp();
    await fireEvent.press(screen.getByTestId('header-alerts'));
    await waitFor(() => expect(screen.getByTestId('screen-alerts')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.queryByTestId('screen-alerts')).toBeNull());
    await fireEvent.press(screen.getByTestId('header-settings'));
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeOnTheScreen());
  });
});

describe('active vehicle context', () => {
  it('shows the active vehicle and switches context via the switcher', async () => {
    await renderApp();
    expect(screen.getByTestId('active-vehicle-chip')).toHaveTextContent(/קורולה/);
    expect(screen.getByTestId('demo-data-strip')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('active-vehicle-chip'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicles')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('vehicle-select-mock-vehicle-motorcycle'));

    await waitFor(() => expect(screen.queryByTestId('screen-vehicles')).toBeNull());
    expect(screen.getByTestId('active-vehicle-chip')).toHaveTextContent(/CB500F/);
  });
});
