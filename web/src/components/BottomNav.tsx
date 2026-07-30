'use client';

import AnalyticsIcon from '@mui/icons-material/Analytics';
import CasinoIcon from '@mui/icons-material/Casino';
import InfoIcon from '@mui/icons-material/Info';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Paper from '@mui/material/Paper';
import { usePathname, useRouter } from 'next/navigation';
import { BOTTOM_NAV_HEIGHT } from './navigation';

const DESTINATIONS = [
  { label: 'Volante', href: '/', icon: <CasinoIcon /> },
  { label: 'Backtesting', href: '/backtesting', icon: <AnalyticsIcon /> },
  { label: 'Sobre', href: '/sobre', icon: <InfoIcon /> },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const currentIndex = DESTINATIONS.findIndex((destination) => destination.href === pathname);

  return (
    <Paper
      elevation={3}
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.appBar }}
    >
      <BottomNavigation
        showLabels
        value={currentIndex === -1 ? 0 : currentIndex}
        onChange={(_, index) => router.push(DESTINATIONS[index].href)}
        sx={{ height: BOTTOM_NAV_HEIGHT }}
      >
        {DESTINATIONS.map((destination) => (
          <BottomNavigationAction key={destination.href} label={destination.label} icon={destination.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
