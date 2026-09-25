import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('app shell', () => {
  it('renders the app name', async () => {
    await render(<Index />);
    expect(screen.getByText('AutoKeep')).toBeTruthy();
  });
});
