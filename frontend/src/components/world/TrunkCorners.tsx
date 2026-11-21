import React from 'react';

/** Riveted brass corner plates + side straps: the trunk's hardware. Decorative. */
export function TrunkCorners() {
  const corner = (cls: string) => (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute z-[25] h-[62px] w-[62px] ${cls}`}
      viewBox="0 0 62 62"
    >
      <path d="M0 0H58L42 16H16V42L0 58Z" fill="#D59E3A" stroke="#7A5212" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill="#4A2F07" />
      <circle cx="38" cy="9" r="2.6" fill="#4A2F07" />
      <circle cx="9" cy="38" r="2.6" fill="#4A2F07" />
    </svg>
  );
  return (
    <>
      {corner('left-0 top-0')}
      {corner('right-0 top-0 -scale-x-100')}
      {corner('bottom-0 left-0 -scale-y-100')}
      {corner('bottom-0 right-0 -scale-100')}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[42px] z-[2] hidden w-[42px] border-x border-[#2A1206] bg-[linear-gradient(90deg,#3D1C0B,#7B4121_38%,#5B2E15_72%,#321608)] shadow-[4px_0_14px_rgba(0,0,0,0.38),-4px_0_14px_rgba(0,0,0,0.28)] xl:block"
      >
        <div className="absolute inset-y-0 inset-x-[6px] border-x-[1.5px] border-dashed border-paper/35" />
        <div className="absolute -left-[5px] top-24 h-[34px] w-[52px] rounded-md border-[5px] border-[#D8A340] shadow-[0_3px_6px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(255,240,180,0.5)]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-[42px] z-[2] hidden w-[42px] border-x border-[#2A1206] bg-[linear-gradient(90deg,#3D1C0B,#7B4121_38%,#5B2E15_72%,#321608)] shadow-[4px_0_14px_rgba(0,0,0,0.38),-4px_0_14px_rgba(0,0,0,0.28)] xl:block"
      >
        <div className="absolute inset-y-0 inset-x-[6px] border-x-[1.5px] border-dashed border-paper/35" />
        <div className="absolute -left-[5px] top-24 h-[34px] w-[52px] rounded-md border-[5px] border-[#D8A340] shadow-[0_3px_6px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(255,240,180,0.5)]" />
      </div>
    </>
  );
}
