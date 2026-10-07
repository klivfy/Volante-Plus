'use client';

import AnalyticsIcon from '@mui/icons-material/Analytics';
import CasinoIcon from '@mui/icons-material/Casino';
import InfoIcon from '@mui/icons-material/Info';
import ScienceIcon from '@mui/icons-material/Science';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Paper from '@mui/material/Paper';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { BOTTOM_NAV_HEIGHT } from './navigation';

const DESTINATIONS = [
  { labelKey: 'nav.volante', href: '/', icon: <CasinoIcon /> },
  { labelKey: 'nav.backtesting', href: '/backtesting', icon: <AnalyticsIcon /> },
  { labelKey: 'nav.avancado', href: '/analise-avancada', icon: <ScienceIcon /> },
  { labelKey: 'nav.sobre', href: '/sobre', icon: <InfoIcon /> },
] as const;

/**
 * Barra de navegação inferior.
 *
 * É um marco `<nav>` e cada destino é um link (`next/link`) com
 * `aria-current="page"` no atual. Antes eram `<button>`s com `router.push`: o
 * leitor de tela não achava a navegação nem sabia em que página estava, e não
 * dava para abrir uma seção em outra aba (`docs/revisao-de-design-2026-10.md`,
 * achado C2).
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const current = DESTINATIONS.find((destination) => destination.href === pathname)?.href ?? '/';

  return (
    <Paper
      component="nav"
      aria-label={t('nav.label')}
      elevation={3}
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.appBar }}
    >
      <BottomNavigation showLabels value={current} sx={{ height: BOTTOM_NAV_HEIGHT }}>
        {DESTINATIONS.map((destination) => (
          <BottomNavigationAction
            key={destination.href}
            value={destination.href}
            label={t(destination.labelKey)}
            icon={destination.icon}
            component={Link}
            href={destination.href}
            aria-current={destination.href === current ? 'page' : undefined}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
