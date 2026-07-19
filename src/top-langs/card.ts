// The github-readme-stats Card frame, ported for the top-langs card. Faithful to
// src/common/Card.js minus the `process.env.NODE_ENV` gate (animations are always
// emitted here) and the unused title-prefix-icon path.

import { encodeHTML } from './ops.js';
import { flexLayout } from './render.js';
import type { CardColors } from './color.js';

export interface CardArgs {
  width?: number;
  height?: number;
  border_radius?: number;
  colors?: Partial<CardColors>;
  customTitle?: string;
  defaultTitle?: string;
}

export class Card {
  width: number;
  height: number;
  hideBorder = false;
  hideTitle = false;
  border_radius: number;
  colors: Partial<CardColors>;
  title: string;
  css = '';
  paddingX = 25;
  paddingY = 35;
  animations = true;
  a11yTitle = '';
  a11yDesc = '';

  constructor({
    width = 100,
    height = 100,
    border_radius = 4.5,
    colors = {},
    customTitle,
    defaultTitle = '',
  }: CardArgs) {
    this.width = width;
    this.height = height;
    this.border_radius = border_radius;
    this.colors = colors;
    this.title = customTitle === undefined ? encodeHTML(defaultTitle) : encodeHTML(customTitle);
  }

  disableAnimations(): void {
    this.animations = false;
  }

  setCSS(value: string): void {
    this.css = value;
  }

  setHideBorder(value: boolean): void {
    this.hideBorder = value;
  }

  setHideTitle(value: boolean): void {
    this.hideTitle = value;
    if (value) {
      this.height -= 30;
    }
  }

  private renderTitle(): string {
    const titleText = `
      <text
        x="0"
        y="0"
        class="header"
        data-testid="header"
      >${this.title}</text>
    `;
    return `
      <g
        data-testid="card-title"
        transform="translate(${this.paddingX}, ${this.paddingY})"
      >
        ${flexLayout({ items: [titleText], gap: 25 }).join('')}
      </g>
    `;
  }

  private renderGradient(): string {
    if (typeof this.colors.bgColor !== 'object') {
      return '';
    }
    const gradients = this.colors.bgColor.slice(1);
    return `
      <defs>
        <linearGradient
          id="gradient"
          gradientTransform="rotate(${this.colors.bgColor[0]})"
          gradientUnits="userSpaceOnUse"
        >
          ${gradients
            .map((grad, index) => {
              const offset = (index * 100) / (gradients.length - 1);
              return `<stop offset="${offset}%" stop-color="#${grad}" />`;
            })
            .join('')}
        </linearGradient>
      </defs>
      `;
  }

  private getAnimations(): string {
    return `
      /* Animations */
      @keyframes scaleInAnimation {
        from {
          transform: translate(-5px, 5px) scale(0);
        }
        to {
          transform: translate(-5px, 5px) scale(1);
        }
      }
      @keyframes fadeInAnimation {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `;
  }

  render(body: string): string {
    return `
      <svg
        width="${this.width}"
        height="${this.height}"
        viewBox="0 0 ${this.width} ${this.height}"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby="descId"
      >
        <title id="titleId">${this.a11yTitle}</title>
        <desc id="descId">${this.a11yDesc}</desc>
        <style>
          .header {
            font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;
            fill: ${this.colors.titleColor};
            animation: fadeInAnimation 0.8s ease-in-out forwards;
          }
          @supports(-moz-appearance: auto) {
            /* Selector detects Firefox */
            .header { font-size: 15.5px; }
          }
          ${this.css}

          ${this.getAnimations()}
          ${
            this.animations === false
              ? `* { animation-duration: 0s !important; animation-delay: 0s !important; }`
              : ''
          }
        </style>

        ${this.renderGradient()}

        <rect
          data-testid="card-bg"
          x="0.5"
          y="0.5"
          rx="${this.border_radius}"
          height="99%"
          stroke="${this.colors.borderColor}"
          width="${this.width - 1}"
          fill="${typeof this.colors.bgColor === 'object' ? 'url(#gradient)' : this.colors.bgColor}"
          stroke-opacity="${this.hideBorder ? 0 : 1}"
        />

        ${this.hideTitle ? '' : this.renderTitle()}

        <g
          data-testid="main-card-body"
          transform="translate(0, ${this.hideTitle ? this.paddingX : this.paddingY + 20})"
        >
          ${body}
        </g>
      </svg>
    `;
  }
}
