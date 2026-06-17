export default defineAppConfig({
  global: {
    picture: {
      dark: "/images/selfie.webp",
      light: "/images/selfie.webp",
      alt: "My profile picture",
    },
    meetingLink: "https://cal.com/",
    email: "yellow90249@gmail.com",
    available: true,
  },
  ui: {
    colors: {
      primary: "blue",
      neutral: "neutral",
    },
    pageHero: {
      slots: {
        container: "py-18 sm:py-24 lg:py-32",
        title: "mx-auto max-w-xl text-pretty text-3xl sm:text-4xl lg:text-5xl",
        description:
          "mt-2 text-md mx-auto max-w-2xl text-pretty sm:text-md text-muted",
      },
    },
  },
  footer: {
    credits: `Gary Portfolio • © ${new Date().getFullYear()}`,
    colorMode: false,
    links: [
      {
        icon: "i-simple-icons-github",
        to: "https://github.com/yellow90249",
        target: "_blank",
        "aria-label": "GitHub",
      },
      {
        icon: "i-simple-icons-facebook",
        to: "https://www.facebook.com/profile.php?id=100004361647678",
        target: "_blank",
        "aria-label": "Facebook",
      },
      {
        icon: "i-simple-icons-instagram",
        to: "https://www.instagram.com/explosion_nipple/",
        target: "_blank",
        "aria-label": "Instagram",
      },
    ],
  },
});
