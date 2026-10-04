import { render, screen } from '@testing-library/react-native';

import { VehiclePhoto } from '../VehicleVisuals';

let mockPhotos: Record<string, string> = {};
jest.mock('@/features/data/DataContext', () => ({
  useAppData: () => ({ vehiclePhotos: mockPhotos, setVehiclePhoto: () => undefined }),
}));

const hidden = { includeHiddenElements: true };

/** Only the user's own photo is ever shown (owner decision 2026-10-04); otherwise an empty frame. */
describe('VehiclePhoto', () => {
  it('without a user photo: an empty frame, no image of any kind', async () => {
    mockPhotos = {};
    await render(<VehiclePhoto vehicle={{ id: 'v1', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-empty', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('vehicle-photo-user', hidden)).toBeNull();
  });

  it("the user's own photo is shown", async () => {
    mockPhotos = { v1: 'file:///photos/v1.jpg' };
    await render(<VehiclePhoto vehicle={{ id: 'v1', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-user', hidden)).toBeOnTheScreen();
  });

  it('another vehicle never shows this photo', async () => {
    mockPhotos = { v1: 'file:///photos/v1.jpg' };
    await render(<VehiclePhoto vehicle={{ id: 'v2', kind: 'car' }} variant="hero" />);
    expect(screen.getByTestId('vehicle-photo-empty', hidden)).toBeOnTheScreen();
  });
});
