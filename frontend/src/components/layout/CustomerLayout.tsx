import React from 'react';
import { Navbar, Footer } from '../Navbar';

// เลย์เอาต์ฝั่งลูกค้า: Header แท็บเมนู + เนื้อหา + Footer (ตาม Prototype UCS-2 ถึง UCS-6.1)
export const CustomerLayout: React.FC<{ children: React.ReactNode; banner?: React.ReactNode; wide?: boolean }> = ({
  children,
  banner,
  wide,
}) => (
  <div className="flex min-h-screen flex-col bg-canvas">
    <Navbar />
    {banner}
    <main className={`mx-auto w-full flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8 ${wide ? 'max-w-[90rem]' : 'max-w-7xl'}`}>{children}</main>
    <Footer />
  </div>
);
