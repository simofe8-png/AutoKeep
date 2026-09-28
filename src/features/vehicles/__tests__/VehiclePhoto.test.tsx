import { render, screen } from '@testing-library/react-native';

import { VehiclePhoto } from '../VehicleVisuals';

let mockPhotos: Record<string, string> = {};
jest.mock('@/features/data/DataContext', () => ({
  useAppData: () => ({ vehiclePhotos: mockPhotos }),
}));

const hidden = { includeHiddenElements: true };

/** The vehicle image never claims to show the identified vehicle unless it is the user's photo. */
describe('VehiclePhoto', () => {
  it('without a user photo: neutral placeholder, labeled as a generic illustration', async () => {
    mockPhotos = {};
    await render(<VehiclePhoto vehicle={{ id: 'v1', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-art', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('vehicle-photo-art-label', hidden)).toHaveTextContent(
      'איור כללי · לא תמונת הרכב שלך',
    );
  });

  it("the user's own photo is preferred and carries no placeholder label", async () => {
    mockPhotos = { v1: 'file:///photos/v1.jpg' };
    await render(<VehiclePhoto vehicle={{ id: 'v1', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-user', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('vehicle-photo-art-label', hidden)).toBeNull();
  });

  it('another vehicle never shows this photo', async () => {
    mockPhotos = { v1: 'file:///photos/v1.jpg' };
    await render(<VehiclePhoto vehicle={{ id: 'v2', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-art', hidden)).toBeOnTheScreen();
  });
});
