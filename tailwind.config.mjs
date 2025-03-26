/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      container: {
        center: true,
        padding: "24px",
        maxWidth: "1200px"
      },
      colors: {
        'primary': '#4dc0b6',
        'primary-dark': '#017F77',
        'primary-light': '#DFF9F7',
        'primary-lighter': '#EEFDFF',
        'accent-light': '#F17179',
        'cyan': {
          500: '#5BBCBE'
        },
        'gray': {
          900: '#312627',
          800: '#323232',
          700: '#4F4F4F',
          600: '#555555',
          500: '#777777',
          400: '#999999',
          300: '#CCCCCC',
          200: '#EEEEEE',
          100: '#F8F8F8',
        },
      },
      fontFamily: {
        sans: ['Lato', 'sans-serif'],
      },
      fontSize: {
        'xs': '1.2rem',
        'sm': '1.4rem',
        'base': '1.6rem',
        'lg': '1.8rem',
        'xl': '2.0rem',
        '2xl': '2.4rem',
        '3xl': '2.8rem',
        '4xl': '3.2rem',
      },
      spacing: {
        'xs': '0.4rem',
        'sm': '0.8rem',
        'md': '1.6rem',
        'lg': '2.4rem',
        'xl': '3.2rem',
        'xxl': '4.8rem',
      },
      borderRadius: {
        'sm': '0.8rem',
        'md': '1.4rem',
        'lg': '3.2rem',
        'pill': '5rem',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px rgba(0, 0, 0, 0.1)',
      },
      zIndex: {
        'header': '100',
        'modal': '200',
        'dropdown': '150',
      }
    }
  },
  // DaisyUI theme customization
  daisyui: {
    themes: [
      {
        graodegente: {
          primary: "#4DC0B5",
          "primary-content": "#FFFFFF",
          secondary: "#312627",
          "secondary-content": "#FFFFFF",
          accent: "#D34566",
          "accent-content": "#FFFFFF",
          neutral: "#4F4F4F",
          "base-100": "#FFFFFF",
          "base-200": "#F8F8F8",
          "base-300": "#EEEEEE",
          info: "#DFF9F7",
          success: "#86efac",
          warning: "#fde68a",
          error: "#fb7185",
          "--rounded-box": "1.4rem",
          "--rounded-btn": "5rem",
          "--rounded-badge": "5rem",
          "--animation-btn": "0.3s",
          "--btn-focus-scale": "0.95",
          "--border-btn": "2px",
          "--tab-radius": "0.8rem",
        }
      }
    ]
  },
  plugins: [require("@tailwindcss/typography"), require("daisyui")],
  darkMode: "class"
};
