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

  it('secondary screens show the bottom menu; a tap opens that tab (owner decision 2026-10-05)', async () => {
    await renderApp();
    expect(screen.queryByTestId('secondary-bottom-nav')).toBeNull();
    await fireEvent.press(screen.getByTestId('header-settings'));
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeOnTheScreen());
    const nav = screen.getByTestId('secondary-bottom-nav');
    expect(nav).toHaveTextContent(/בית.*תחזוקה.*היסטוריה.*מסמכים/);
    await fireEvent.press(screen.getByTestId('nav-tab-maintenance'));
    await waitFor(() => expect(screen.getByTestId('screen-maintenance')).toBeOnTheScreen());
    expect(screen.queryByTestId('screen-settings')).toBeNull();
    expect(screen.queryByTestId('secondary-bottom-nav')).toBeNull();
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
    // RTL: the menu is the first child of the header row, i.e. the reading start (physical right).
    const order = screen
      .getAllByRole('button')
      .map((b) => b.props.testID)
      .filter((t) => t === 'header-settings' || t === 'header-alerts');
    expect(order).toEqual(['header-settings', 'header-alerts']);
    await fireEvent.press(screen.getByTestId('header-alerts'));
    await waitFor(() => expect(screen.getByTestId('screen-alerts')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.queryByTestId('screen-alerts')).toBeNull());
    await fireEvent.press(screen.getByTestId('header-settings'));
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeOnTheScreen());
  });
});

describe('active vehicle context', () => {
  it('Home shows ONE active-vehicle card; swiping the card switches the whole Home', async () => {
    await renderApp();
    expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/קורולה/);
    expect(screen.queryByTestId('vehicle-selector')).toBeNull();
    expect(screen.getAllByTestId('vehicle-pager')).toHaveLength(1);
    expect(screen.getByTestId('vehicle-pager-dots')).toBeOnTheScreen();
    expect(screen.getByTestId('demo-data-strip')).toBeTruthy();
    const before = screen.getByTestId('home-odometer-card').props.accessibilityLabel;

    // The swipe gesture's accessible equivalent (the pan itself is covered by pager.test.ts).
    await fireEvent(screen.getByTestId('vehicle-pager'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('home-active-vehicle')).not.toHaveTextContent(/קורולה/),
    );
    expect(screen.getByTestId('home-odometer-card').props.accessibilityLabel).not.toEqual(before);
  });

  it('"my vehicles" is in the menu; choosing a vehicle there lands on its Home', async () => {
    await renderApp();
    await fireEvent.press(screen.getByTestId('header-settings'));
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeOnTheScreen());
    expect(screen.getByTestId('settings-vehicles')).toHaveTextContent(/כלי הרכב שלי/);
    await fireEvent.press(screen.getByTestId('settings-vehicles'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicles')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('vehicle-select-mock-vehicle-motorcycle'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen());
    expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/CB500F/);
  });
});
