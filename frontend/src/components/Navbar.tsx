"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, ContactRound, House, MapPinned, Phone, Settings, UserRound, UsersRound } from "lucide-react";

const navigation = [
  { href: "/", label: "Home", icon: House, mobile: true },
  { href: "/safe-route", label: "Routes", icon: MapPinned, mobile: true },
  { href: "/nearby", label: "Nearby help", icon: CircleHelp, mobile: false },
  { href: "/community", label: "Community", icon: UsersRound, mobile: true },
  { href: "/emergency-contacts", label: "Contacts", icon: ContactRound, mobile: false },
  { href: "/settings", label: "Settings", icon: Settings, mobile: false },
  { href: "/profile", label: "You", icon: UserRound, mobile: true },
];

export function Firefly() {
  return <span className="firefly" aria-hidden="true"><i /><i /><i /></span>;
}

export function Navbar() {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href ||
    (href === "/safe-route" && pathname === "/journey");
  const inProfile = ["/settings", "/emergency-contacts", "/incidents"].includes(pathname);
  return (
    <>
      <a className="skip-link" href="#content">Skip to content</a>
      <header className="mobile-header">
        <Link href="/" className="jugnu-brand"><Firefly />Jugnu</Link>
        <Link href="/incidents" className="icon-button" aria-label="Recent activity"><Bell size={22} /></Link>
      </header>
      <aside className="desktop-nav">
        <Link href="/" className="jugnu-brand"><Firefly />Jugnu</Link>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined}>
              <Icon size={23} />{label}
            </Link>
          ))}
        </nav>
        <Link href="/sos" className="desktop-sos"><Phone size={25} />SOS</Link>
      </aside>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.filter(item => item.mobile).map(({ href, label, icon: Icon }, i) => (
          <div key={href}>
            {i === 2 && <Link href="/sos" className="mobile-sos" aria-label="SOS" aria-current={pathname === "/sos" ? "page" : undefined}>SOS</Link>}
            <Link href={href} aria-current={isCurrent(href) || (href === "/profile" && inProfile) ? "page" : undefined}>
              <Icon size={23} />{label}
            </Link>
          </div>
        ))}
      </nav>
    </>
  );
}
