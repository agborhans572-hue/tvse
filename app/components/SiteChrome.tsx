"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

const navGroups = [
  {
    label: "Solutions",
    links: [
      ["Booking & trip management", "/solutions/booking-trip-management"],
      ["Program & payment insights", "/solutions/program-payment-insights"],
      ["Meetings & events", "/solutions/meetings-events"],
      ["Consulting", "/solutions/consulting"],
    ],
  },
  {
    label: "Technology",
    links: [
      ["Platform", "/technology/platform"],
      ["The TVSE Marketplace", "/technology/marketplace"],
      ["APIs and Data", "/technology/apis-data"],
    ],
  },
  {
    label: "Resources",
    links: [
      ["All resources", "/resources"],
      ["Blog", "/resources/blog"],
      ["How-to guides", "/resources/guides"],
    ],
  },
  {
    label: "Login",
    links: [
      ["Traveler portal", "/login/traveler"],
      ["Business account", "/login/business"],
      ["Partner connect", "/login/partner"],
    ],
  },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const closeMenus = () => {
    setMenuOpen(false);
    setActiveMenu(null);
  };

  return (
    <header className="site-header shell">
      <Link className="logo logo-with-3d" href="/" aria-label="TVSE Travel home" onClick={closeMenus}>
        <motion.span
          className="header-logo-mark"
          whileHover={reduceMotion ? undefined : { scale: 1.08, rotateX: -7, rotateY: 10, y: -2 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <Image src="/tvse-3d-logo.png" alt="" fill unoptimized priority sizes="82px" />
        </motion.span>
        <span className="header-logo-type">
          <strong>TVSE</strong>
          <small>TRAVEL</small>
        </span>
      </Link>

      <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Primary navigation">
        {navGroups.map((group) => (
          <div
            className={activeMenu === group.label ? "nav-group is-open" : "nav-group"}
            key={group.label}
            onMouseEnter={() => setActiveMenu(group.label)}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button
              className="nav-trigger"
              type="button"
              aria-expanded={activeMenu === group.label}
              onClick={() => setActiveMenu((current) => current === group.label ? null : group.label)}
            >
              {group.label} <span aria-hidden="true">⌄</span>
            </button>
            <div className="nav-dropdown">
              {group.links.map(([label, href]) => (
                <Link href={href} key={href} onClick={closeMenus}>{label}</Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="header-actions">
        <Link className="search-link" href="/resources" aria-label="Search TVSE resources">⌕</Link>
        <Link className="pill primary compact" href="/contact">Get started</Link>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span />
        </button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const reduceMotion = useReducedMotion();

  return (
    <footer className="footer" id="contact">
      <div className="footer-cta shell">
        <h2>Let&apos;s go somewhere.</h2>
        <p>Share the idea. We&apos;ll turn it into a journey.</p>
        <Link className="pill white" href="/contact">Start the conversation <span>→</span></Link>
      </div>
      <div className="footer-columns shell">
        <div className="footer-about">
          <Link className="logo logo-with-3d footer-logo" href="/" aria-label="TVSE Travel home">
            <motion.span
              className="header-logo-mark footer-logo-mark"
              whileHover={reduceMotion ? undefined : { scale: 1.08, rotateX: -7, rotateY: 10, y: -2 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              <Image src="/tvse-3d-logo-transparent.png" alt="" fill unoptimized sizes="124px" />
            </motion.span>
            <span className="header-logo-type">
              <strong>TVSE</strong>
              <small>TRAVEL</small>
            </span>
          </Link>
          <p>People-first travel design for holidays, business trips and unforgettable escapes - from Nairobi to the world.</p>
          <div className="socials" aria-label="Social media"><Link href="/contact">in</Link><Link href="/contact">ig</Link><Link href="/contact">f</Link></div>
        </div>
        <div>
          <h3>Solutions</h3>
          <Link href="/solutions/booking-trip-management">Booking & trip management</Link>
          <Link href="/solutions/meetings-events">Meetings & events</Link>
          <Link href="/solutions/consulting">Travel consulting</Link>
          <Link href="/solutions/program-payment-insights">Program insights</Link>
        </div>
        <div>
          <h3>Technology</h3>
          <Link href="/technology/platform">TVSE platform</Link>
          <Link href="/technology/marketplace">Partner marketplace</Link>
          <Link href="/technology/apis-data">APIs & data</Link>
          <Link href="/resources">Resources</Link>
        </div>
        <div>
          <h3>Contact</h3>
          <a href="mailto:hello@tvsetravel.com">hello@tvsetravel.com</a>
          <span>Nairobi, Kenya</span>
          <span>Mon-Fri · 8am-6pm</span>
          <Link href="/login/traveler">Traveler portal</Link>
        </div>
      </div>
      <div className="footer-bottom shell">
        <span>© 2026 TVSE Travel Agency Ltd.</span>
        <div><Link href="/resources">Privacy</Link><Link href="/resources">Terms</Link><a href="#top">Back to top ↑</a></div>
      </div>
      <div className="footer-rings" aria-hidden="true"><i /><i /><i /><i /></div>
    </footer>
  );
}
