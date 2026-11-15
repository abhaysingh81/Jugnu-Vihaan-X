import Link from "next/link";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeading({ title, back, children }: { title: string; back?: string; children?: ReactNode }) {
  return <div className="page-heading">
    {back && <Link href={back} className="icon-button back-button" aria-label="Go back"><ArrowLeft size={23} /></Link>}
    <h1>{title}</h1>{children}
  </div>;
}

export function ActionRow({ href, icon: Icon, title, detail }: { href: string; icon: LucideIcon; title: string; detail?: ReactNode }) {
  return <Link href={href} className="jugnu-panel action-row"><Icon size={24} /><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><ChevronRight size={18} /></Link>;
}

export function MapPreview({ nearby = false, active = false }: { nearby?: boolean; active?: boolean }) {
  return <div className={`map-preview ${active ? "map-active" : ""}`} role="img" aria-label={nearby ? "Illustrative Delhi map showing sample help locations" : "Illustrative walking route in Connaught Place"}>
    <svg viewBox="0 0 760 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="blocks" width="60" height="68" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
          <path fill="#202322" d="M0 0h60v68H0z"/>
          <path fill="#2c302f" d="M9 8h15v19H9z M33 9h18v22H33z M6 38h17v21H6z M35 42h15v15H35z"/>
          <path stroke="#363a3b" strokeWidth="2" d="M0 0h60 M0 34h60 M0 0v68 M30 0v68"/>
        </pattern>
      </defs>
      <rect width="760" height="450" fill="url(#blocks)"/>
      <path d="M410 275l76-31 50 46-42 69-98-19zM53 270l72 31-19 36-71-27zM579 358l47-18 29 29-19 41-43-22z" fill="#31412d"/>
      <g fill="none" stroke="#505457" strokeWidth="5">
        <path d="M-35 351L525 119 780 96M-20 143L525 119 770 269M257 470L525 119 640-10M-8 58l181 60 209 332M137 470l-29-107 92-78 105-56 220-110M533 463L525 119 372-20M-15 406l144 3 183-60 172 48 271-48"/>
        <circle cx="525" cy="119" r="91"/><circle cx="525" cy="119" r="61"/>
      </g>
      <g fill="#ddd9cb" fontFamily="Arial, sans-serif" fontSize="16" textAnchor="middle">
        <text x="462" y="62">Connaught Place</text><text x="470" y="323">Central Park</text><text x="224" y="305">Shankar Market</text><text x="634" y="247">Janpath</text>
      </g>
      {!nearby && <g>
        <path d="M175 365L241 308 262 260 354 262 382 206 437 197 465 149 515 142 539 112" fill="none" stroke="#0b0c0a" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M175 365L241 308 262 260 354 262 382 206 437 197 465 149 515 142 539 112" fill="none" stroke="#ffcf31" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="175" cy="365" r="10" fill="#ffcf31" stroke="#fff5d4" strokeWidth="4"/>
      </g>}
      <g fill={nearby ? "#75a9ff" : "#ff595b"} stroke="#fff3e5" strokeWidth="2">
        <circle cx="539" cy="112" r="12"/>{nearby && <circle cx="181" cy="260" r="12" fill="#ff595b"/>}
      </g>
      <rect x="457" y="132" width="151" height="33" rx="8" fill="#141512" stroke="#5f6057"/>
      <text x="532.5" y="154" textAnchor="middle" fill="#f8f4e8" fontFamily="Arial, sans-serif" fontSize="15">{nearby ? "Police station" : "Rajiv Chowk Metro"}</text>
    </svg>
    <span className="map-note">Illustrative map</span>
  </div>;
}
