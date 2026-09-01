export default function Home() {
  return (
    <main>
      <h1>Plumbline Studio</h1>
      <p>Brand and interface systems.</p>
      <section className="services">
        <h2>Services</h2>
        <ul className="services-list">
          <li className="service">
            <h3 className="service-name">Brand Identity</h3>
            <p className="service-description">
              Marks, systems and rules that hold together across every surface.
            </p>
          </li>
          <li className="service">
            <h3 className="service-name">Interface Design</h3>
            <p className="service-description">
              Screens built for clarity first, decoration only where it earns its place.
            </p>
          </li>
          <li className="service">
            <h3 className="service-name">Design Systems</h3>
            <p className="service-description">
              Shared components and tokens that keep product and brand in step.
            </p>
          </li>
        </ul>
      </section>
    </main>
  );
}
