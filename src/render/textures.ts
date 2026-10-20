import { Texture } from 'pixi.js';
import type { FacilityKind } from '../sim/types';

export interface ArtSet {
  grass: Texture;
  tree: Texture;
  treePine: Texture;
  cart: Texture;
  golfer: Texture;
  facilities: Record<FacilityKind, Texture>;
  numbers: Texture[];
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D is required to generate course art.');
  return { c, g };
}

function grassTexture() {
  const { c, g } = canvas(128, 128);
  const a = '#6eae56';
  const b = '#78b85e';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? a : b;
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  for (let i = 0; i < 180; i++) {
    const x = (i * 47) % 128;
    const y = (i * 29) % 128;
    g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(20,70,25,0.18)';
    g.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 5 === 0 ? 3 : 1);
  }
  return Texture.from(c);
}

function treeTexture(pine: boolean) {
  const { c, g } = canvas(128, 148);
  g.translate(64, 78);
  g.fillStyle = 'rgba(20,40,16,0.28)';
  g.beginPath();
  g.ellipse(8, 28, 36, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5a3a22';
  g.fillRect(-3, 10, 7, 26);
  if (pine) {
    g.fillStyle = '#173f27';
    g.beginPath();
    g.moveTo(0, -58);
    g.lineTo(34, 18);
    g.lineTo(-34, 18);
    g.fill();
    g.fillStyle = '#1f6a38';
    g.beginPath();
    g.moveTo(0, -44);
    g.lineTo(26, 8);
    g.lineTo(-26, 8);
    g.fill();
    g.fillStyle = '#3d9a52';
    g.beginPath();
    g.moveTo(-4, -40);
    g.lineTo(8, -8);
    g.lineTo(-14, -6);
    g.fill();
  } else {
    const blobs: [string, number, number, number][] = [
      ['#143c28', 0, -6, 34],
      ['#1c5a34', -16, -2, 26],
      ['#22723c', 16, 0, 24],
      ['#2f8a48', -4, 8, 22],
      ['#49a85c', 8, -10, 16],
    ];
    for (const [color, x, y, r] of blobs) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(230,255,220,0.28)';
    g.beginPath();
    g.arc(-12, -16, 8, 0, Math.PI * 2);
    g.fill();
  }
  return Texture.from(c);
}

function cartTexture() {
  const { c, g } = canvas(96, 64);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(48, 52, 28, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f4f1e6';
  g.beginPath();
  g.roundRect(16, 26, 62, 18, 6);
  g.fill();
  g.fillStyle = '#1e3d2c';
  g.fillRect(22, 30, 22, 8);
  g.fillStyle = '#d7b15a';
  g.beginPath();
  g.moveTo(48, 18);
  g.lineTo(78, 28);
  g.lineTo(46, 30);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(30, 46, 6, 0, Math.PI * 2);
  g.arc(68, 46, 6, 0, Math.PI * 2);
  g.fill();
  return Texture.from(c);
}

function golferTexture() {
  const { c, g } = canvas(48, 72);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(24, 64, 10, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d7b15a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(30, 28);
  g.lineTo(40, 48);
  g.stroke();
  g.fillStyle = '#f4efe2';
  g.fillRect(18, 24, 12, 18);
  g.fillStyle = '#c4322c';
  g.fillRect(18, 24, 12, 6);
  g.fillStyle = '#f0c9a0';
  g.beginPath();
  g.arc(24, 16, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d3b2c';
  g.fillRect(16, 42, 5, 14);
  g.fillRect(26, 42, 5, 14);
  return Texture.from(c);
}

function facilityTexture(kind: FacilityKind) {
  const { c, g } = canvas(220, 160);
  const roof = () => {
    g.fillStyle = '#1c3a2a';
    g.beginPath();
    g.moveTo(18, 78);
    g.lineTo(110, 28);
    g.lineTo(202, 78);
    g.closePath();
    g.fill();
    g.fillStyle = '#2f6a45';
    g.beginPath();
    g.moveTo(28, 76);
    g.lineTo(110, 38);
    g.lineTo(190, 76);
    g.closePath();
    g.fill();
  };
  g.clearRect(0, 0, 220, 160);
  if (kind === 'carpark') {
    g.fillStyle = '#5d6560';
    g.beginPath();
    g.roundRect(16, 36, 188, 100, 10);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.strokeRect(32 + i * 42, 52, 30, 46);
    }
    g.fillStyle = '#d7b15a';
    g.fillRect(40, 64, 22, 12);
    g.fillStyle = '#8fd0c4';
    g.fillRect(124, 66, 22, 12);
    return Texture.from(c);
  }
  if (kind === 'range') {
    g.fillStyle = '#6ea85a';
    g.fillRect(10, 40, 200, 100);
    g.fillStyle = '#efe6cf';
    for (let i = 0; i < 5; i++) {
      g.fillRect(24 + i * 36, 48, 26, 34);
      g.strokeStyle = 'rgba(80,120,70,0.45)';
      g.strokeRect(24 + i * 36, 48, 26, 70);
    }
    g.fillStyle = '#c4322c';
    g.beginPath();
    g.arc(180, 96, 8, 0, Math.PI * 2);
    g.fill();
    return Texture.from(c);
  }
  if (kind === 'irrigation') {
    g.fillStyle = '#dfe7df';
    g.beginPath();
    g.roundRect(24, 70, 70, 54, 6);
    g.fill();
    g.fillStyle = '#2f6ea5';
    g.beginPath();
    g.ellipse(140, 92, 48, 36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7ec8ef';
    g.beginPath();
    g.ellipse(128, 82, 16, 8, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c3a2a';
    g.fillRect(48, 58, 16, 16);
    return Texture.from(c);
  }
  g.fillStyle = '#f3efe4';
  g.beginPath();
  g.roundRect(28, 72, 164, 62, 4);
  g.fill();
  roof();
  g.fillStyle = kind === 'restaurant' ? '#f0a05a' : '#6ea4c8';
  const windows = kind === 'maintenance' ? 2 : 4;
  for (let i = 0; i < windows; i++) g.fillRect(46 + i * 34, 86, 20, 16);
  g.fillStyle = '#6b3a22';
  g.fillRect(96, 96, 22, 38);
  if (kind === 'proshop') {
    g.fillStyle = '#c4322c';
    g.fillRect(36, 64, 148, 10);
    g.fillStyle = '#f4efe2';
    g.fillRect(36, 74, 148, 4);
  }
  if (kind === 'restaurant') {
    g.fillStyle = '#f2d48a';
    g.fillRect(150, 78, 18, 28);
  }
  if (kind === 'maintenance') {
    g.fillStyle = '#8a8f88';
    g.fillRect(48, 96, 40, 28);
  }
  if (kind === 'clubhouse') {
    g.fillStyle = '#d7b15a';
    g.beginPath();
    g.arc(107, 58, 6, 0, Math.PI * 2);
    g.fill();
  }
  return Texture.from(c);
}

function numberTextures() {
  const out: Texture[] = [];
  for (let n = 1; n <= 18; n++) {
    const { c, g } = canvas(128, 128);
    g.fillStyle = '#fffaf2';
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#c4322c';
    g.stroke();
    g.fillStyle = '#c4322c';
    g.font = '700 62px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 68);
    out.push(Texture.from(c));
  }
  return out;
}

let cached: ArtSet | null = null;

export function getArt(): ArtSet {
  if (cached) return cached;
  const kinds: FacilityKind[] = ['clubhouse', 'proshop', 'range', 'restaurant', 'carpark', 'maintenance', 'irrigation'];
  const facilities = {} as Record<FacilityKind, Texture>;
  for (const k of kinds) facilities[k] = facilityTexture(k);
  cached = {
    grass: grassTexture(),
    tree: treeTexture(false),
    treePine: treeTexture(true),
    cart: cartTexture(),
    golfer: golferTexture(),
    facilities,
    numbers: numberTextures(),
  };
  return cached;
}
