import {
  ArrowRight,
  Check,
  Command,
  LockKeyhole,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { clientCategories } from "../features/categories";

type Props = {
  category: string;
  onCategory: (value: string) => void;
  onStart: () => void;
};

const categoryIcons = [
  LockKeyhole,
  Command,
  MessageCircle,
  Sparkles,
  MessageCircle,
  Sparkles,
];

export function CategoryStart({ category, onCategory, onStart }: Props) {
  return (
    <div className="start-panel">
      <div className="start-kicker">
        <span className="brand-mark">
          <Sparkles size={17} />
        </span>
        <span>UM BOM COMEÇO</span>
      </div>
      <h2>
        Com o que podemos
        <br />
        <em>ajudar hoje?</em>
      </h2>
      <p>
        Escolha uma categoria para dar contexto. Se não tiver certeza, a gente
        descobre junto.
      </p>
      <div className="category-grid">
        {clientCategories.map((item, index) => {
          const Icon = categoryIcons[index];
          return (
            <button
              key={item.value}
              className={`category-card ${category === item.value ? "category-card-active" : ""}`}
              onClick={() => onCategory(item.value)}
            >
              <span className={`category-glyph glyph-${index}`}>
                <Icon size={18} />
              </span>
              <span>
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </span>
              {category === item.value && (
                <Check size={16} className="category-check" />
              )}
            </button>
          );
        })}
      </div>
      <button
        className="button button-primary start-button"
        onClick={onStart}
        disabled={!category}
      >
        Começar atendimento <ArrowRight size={17} />
      </button>
      <div className="start-note">
        <LockKeyhole size={14} /> Apenas assuntos de TI. Seus chamados são
        privados.
      </div>
    </div>
  );
}
