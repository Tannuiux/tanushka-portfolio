// page.js is your home page. It just stacks the sections in order, like frames in Figma.
// Opening: Intro (you and your AI mate push the wall) reveals the Desk. Your name and title in the photo hero are drawn in dots (DotText).
import Nav from "@/components/Nav";
import Intro from "@/components/Intro";
import Desk from "@/components/Desk";
import PhotoHero from "@/components/PhotoHero";
import About from "@/components/About";
import WorkCards from "@/components/WorkCards";
import Experience from "@/components/Experience";
import Process from "@/components/Process";
import Testimonials from "@/components/Testimonials";
import Toolbox from "@/components/Toolbox";
import Beyond from "@/components/Beyond";
import Connect from "@/components/Connect";

export default function Home() {
  return (
    <>
      <Intro />
      <Nav />
      <Desk />
      <PhotoHero />
      <About />
      <WorkCards />
      <Experience />
      <Process />
      <Testimonials />
      <Toolbox />
      <Beyond />
      <Connect />
    </>
  );
}
