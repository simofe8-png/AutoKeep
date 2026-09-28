import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

const LONG = { timeout: 8000 };

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

async function switchTo(vehicleId: string) {
  await fireEvent.press(screen.getByTestId('active-vehicle-chip'));
  await waitFor(() => expect(screen.getByTestId('screen-vehicles')).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId(`vehicle-select-${vehicleId}`));
  await waitFor(() => expect(screen.queryByTestId('screen-vehicles')).toBeNull());
}

describe('Home (T016)', () => {
  it('answers active vehicle, status, next service, remaining and forecast (צפי)', async () => {
    await open('/', 'screen-home');
    expect(screen.getByTestId('active-vehicle-chip')).toHaveTextContent(/קורולה/);
    // Next service (Home reference): due date, remaining time and distance.
    expect(screen.getByTestId('home-next-service')).toHaveTextContent(/15.12.2026/);
    expect(screen.getByTestId('home-next-service')).toHaveTextContent(/81 ימים/);
    expect(screen.getByTestId('home-next-service')).toHaveTextContent(/5,750/);
    expect(screen.getByTestId('home-alerts')).toHaveTextContent(/טיפול מתקרב/);
    // The plan shows the service, its due status and the labeled forecast (צפי).
    await fireEvent.press(screen.getByTestId('home-view-service'));
    await waitFor(() => expect(screen.getByTestId('screen-maintenance')).toBeOnTheScreen());
    expect(screen.getByTestId('plan-item-next')).toHaveTextContent(/טיפול 90,000/);
    expect(screen.getByTestId('due-upcoming')).toBeOnTheScreen();
    expect(screen.getByTestId('plan-forecast')).toHaveTextContent(/צפי/);
  });

  it('never claims the vehicle is healthy; unverified schedule invents nothing', async () => {
    await open('/', 'screen-home');
    await switchTo('mock-vehicle-motorcycle');
    const home = screen.getByTestId('screen-home');
    expect(within(home).getByTestId('schedule-unavailable')).toBeOnTheScreen();
    expect(within(home).queryByTestId('next-service-summary')).toBeNull();
    expect(home).not.toHaveTextContent(/בריא|תקין לחלוטין|הרכב במצב טוב/);
  });
});

describe('Maintenance (T017/T018)', () => {
  it('items expand in place with manufacturer text, action type and exact source', async () => {
    await open('/maintenance', 'screen-maintenance');
    await fireEvent.press(screen.getByTestId('maintenance-next-details'));
    await waitFor(() => expect(screen.getByTestId('screen-next-service')).toBeOnTheScreen());
    expect(screen.getByTestId('next-service-summary')).toHaveTextContent(/5,750/);
    expect(screen.getByTestId('next-service-forecast')).toHaveTextContent(/צפי/);
    expect(screen.queryByTestId('maintenance-item-item-car-oil-details')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /שמן מנוע, החלפה/ }));
    const details = screen.getByTestId('maintenance-item-item-car-oil-details');
    expect(details).toHaveTextContent(/15,000/);
    expect(details).toHaveTextContent(/החלפה/);
    expect(details).toHaveTextContent(/עמ׳ 412 · סעיף 6.3 · טבלה 6-1/);
    expect(within(details).getByTestId('item-verification-item-car-oil')).toHaveTextContent(
      /מאומת/,
    );
  });

  it('evidence link opens the source document', async () => {
    await open('/next-service', 'screen-next-service');
    await fireEvent.press(screen.getByRole('button', { name: /שמן מנוע, החלפה/ }));
    await fireEvent.press(
      within(screen.getByTestId('maintenance-item-item-car-oil-details')).getByRole('button', {
        name: 'פתיחת המקור',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('screen-document-detail')).toBeOnTheScreen());
    expect(screen.getByTestId('document-original')).toBeOnTheScreen();
    expect(screen.getByTestId('document-derived')).toBeOnTheScreen();
  });
});

describe('Garage Mode (T019)', () => {
  it('keeps manufacturer / known / garage sections separate; garage notes stay garage notes', async () => {
    await open('/garage', 'screen-garage');
    const manufacturer = screen.getByTestId('garage-section-manufacturer');
    const garage = screen.getByTestId('garage-section-garage');
    expect(manufacturer).toHaveTextContent(/שמן מנוע/);
    expect(garage).toHaveTextContent(/רפידות בלם קדמיות/);
    expect(manufacturer).not.toHaveTextContent(/רפידות בלם קדמיות/);

    await fireEvent.press(screen.getByTestId('garage-add-note'));
    await fireEvent.changeText(screen.getByTestId('garage-note-input'), 'להחליף מצבר בקרוב');
    await fireEvent.press(screen.getByTestId('garage-note-dialog-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('garage-section-garage')).toHaveTextContent(/להחליף מצבר בקרוב/),
    );
    expect(screen.getByTestId('garage-section-manufacturer')).not.toHaveTextContent(/מצבר/);
  });
});

describe('Service capture → review → confirm → history (T020–T022)', () => {
  it('manual entry validates minimum data and requires explicit confirmation', async () => {
    await open('/service/new', 'screen-service-new');
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/12-345-67/);
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('service-to-review'));
    expect(screen.getByText('יש לסמן לפחות פעולה אחת שבוצעה')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'שמן מנוע' }));
    // Checkbox = performed; the action type is a separate selector.
    expect(screen.getByRole('radio', { name: 'החלפה' })).toBeSelected();
    await fireEvent.changeText(screen.getByTestId('new-action-input'), 'שטיפת מנוע');
    await fireEvent.press(screen.getByTestId('add-action'));
    await fireEvent.changeText(screen.getByTestId('service-date'), '2026-09-20');
    await fireEvent.changeText(screen.getByTestId('service-odometer'), '84250');
    await fireEvent.press(screen.getByTestId('service-to-review'));

    await waitFor(() => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-confirm'));
    await waitFor(() => expect(screen.getByTestId('service-confirm-dialog')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));

    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen(), LONG);
    const list = screen.getByTestId('history-list');
    expect(list).toHaveTextContent(/20.9.2026/);
    expect(list).toHaveTextContent(/שטיפת מנוע/);
  }, 30000);

  it('document extraction yields a draft with uncertain fields and does not auto-commit', async () => {
    await open('/history', 'screen-history');
    const before = within(screen.getByTestId('history-list')).getAllByRole('button').length;
    await fireEvent.press(screen.getByTestId('history-add'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-method-photo'));
    await waitFor(
      () => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('uncertain-odometer')).toBeOnTheScreen();
    expect(screen.getByTestId('review-original-document')).toBeOnTheScreen();
    // Leave without confirming: history is unchanged.
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen());
    expect(within(screen.getByTestId('history-list')).getAllByRole('button')).toHaveLength(before);
  }, 30000);

  it('service detail shows actions, performed state and provenance', async () => {
    await open('/service/svc-car-1', 'screen-service-detail');
    expect(screen.getByTestId('detail-action-a-car-1-4')).toHaveTextContent(/לא בוצע/);
    expect(screen.getByTestId('service-evidence')).toHaveTextContent(/מסמך מוסך/);
  });
});

describe('Documents (T023)', () => {
  it('library is vehicle-scoped and grouped by kind', async () => {
    await open('/documents', 'screen-documents');
    expect(screen.getByTestId('documents-group-owners_manual')).toBeOnTheScreen();
    expect(screen.getByTestId('documents-group-invoice')).toBeOnTheScreen();
    await switchTo('mock-vehicle-scooter');
    await waitFor(() => expect(screen.queryByTestId('documents-group-invoice')).toBeNull());
  });
});

describe('Alerts (T024)', () => {
  it('deep link opens the alert for its own vehicle and explains it', async () => {
    await open('/alerts/alert-moto-stale', 'screen-alert-detail');
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/CB500F/);
    expect(screen.getByTestId('alert-why')).toBeOnTheScreen();
    expect(screen.getByTestId('alert-basis')).toHaveTextContent(/18,420/);
    await fireEvent.press(screen.getByTestId('alert-update-odometer'));
    await waitFor(() => expect(screen.getByTestId('screen-odometer')).toBeOnTheScreen());
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/CB500F/);
    await fireEvent.changeText(screen.getByTestId('odometer-input'), '100');
    expect(screen.getByTestId('odometer-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('odometer-input'), '19,000');
    await fireEvent.press(screen.getByTestId('odometer-save'));
    await waitFor(() => expect(screen.queryByTestId('screen-odometer')).toBeNull());
  }, 20000);

  it('"handled" leads to service recording with the item preselected', async () => {
    await open('/alerts/alert-car-deferred', 'screen-alert-detail');
    await fireEvent.press(screen.getByTestId('alert-record-service'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());
    expect(screen.getByRole('checkbox', { name: 'מסנן אוויר לתא הנוסעים' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'שמן מנוע' })).not.toBeChecked();
  }, 20000);
});

describe('My Vehicles / lifecycle / dossier (T025, T028, T029)', () => {
  it('archive keeps data and allows restore; delete needs preview + typed confirmation', async () => {
    await open('/vehicles', 'screen-vehicles');
    await fireEvent.press(screen.getByTestId('vehicle-manage-mock-vehicle-scooter'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-manage')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('vehicle-archive'));
    await fireEvent.press(screen.getByTestId('archive-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('vehicles-archived')).toBeOnTheScreen());
    expect(screen.getByTestId('vehicles-archived')).toHaveTextContent(/XMAX/);

    await fireEvent.press(screen.getByTestId('vehicle-manage-mock-vehicle-scooter'));
    await waitFor(() => expect(screen.getByTestId('vehicle-restore')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('vehicle-restore'));
    await waitFor(() => expect(screen.queryByTestId('vehicles-archived')).toBeNull());

    await fireEvent.press(screen.getByTestId('vehicle-manage-mock-vehicle-motorcycle'));
    await waitFor(() => expect(screen.getByTestId('vehicle-delete')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('vehicle-delete'));
    expect(screen.getByTestId('delete-preview')).toHaveTextContent(/1 רישומי טיפול/);
    expect(screen.getByTestId('delete-dialog-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), '123-45-678');
    await fireEvent.press(screen.getByTestId('delete-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-deleted')).toBeOnTheScreen());
  }, 30000);

  it('dossier labels user-reported facts', async () => {
    await open('/vehicle/mock-vehicle-car/dossier', 'screen-dossier');
    expect(screen.getByTestId('dossier-event-svc-car-2')).toHaveTextContent(/דווח על ידי המשתמש/);
    expect(screen.getByTestId('dossier-event-svc-car-1')).toHaveTextContent(/מסמך מוסך/);
  });
});

describe('Account & settings (T026, T027)', () => {
  it('account is offered once valuable data exists, framed as backup', async () => {
    await open('/', 'screen-home');
    await fireEvent.press(screen.getByTestId('account-offer-action'));
    await waitFor(() => expect(screen.getByTestId('screen-account')).toBeOnTheScreen());
    expect(screen.getByTestId('backup-status')).toHaveTextContent(/הנתונים שמורים במכשיר בלבד/);
    expect(screen.getByTestId('account-sign-in')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('account-username'), 'owner');
    await fireEvent.press(screen.getByTestId('account-sign-in'));
    await waitFor(() => expect(screen.getByTestId('backup-status')).toHaveTextContent(/מחובר/));
  });

  it('settings reach behaviour controls; offline mode shows the offline state in context', async () => {
    await open('/settings', 'screen-settings');
    expect(screen.getByTestId('settings-account')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('settings-offline'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.getByTestId('offline-banner')).toBeOnTheScreen());
  });
});
