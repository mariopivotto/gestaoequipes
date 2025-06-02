import React from 'react';
import { LucideX } from 'lucide-react';

/**
 * Componente Modal reutilizável.
 * @param {object} props
 * @param {boolean} props.isOpen - Controla a visibilidade do modal.
 * @param {Function} props.onClose - Função chamada ao fechar o modal (clique no X ou fora).
 * @param {string} props.title - Título exibido no cabeçalho do modal.
 * @param {React.ReactNode} props.children - Conteúdo a ser renderizado dentro do modal.
 * @param {string} [props.maxWidth="max-w-2xl"] - Classe Tailwind para largura máxima (opcional).
 */
const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }) => {
    if (!isOpen) return null;

    // Função para fechar o modal se o clique for no backdrop (fundo)
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-opacity duration-300 ease-in-out"
            onClick={handleBackdropClick} // Fecha ao clicar fora
            aria-modal="true"
            role="dialog"
        >
            <div className={`bg-white rounded-lg shadow-xl w-full ${maxWidth} overflow-hidden transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear`}>
                {/* Cabeçalho do Modal */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Fechar modal"
                    >
                        <LucideX size={24} />
                    </button>
                </div>

                {/* Conteúdo do Modal */}
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    {children}
                </div>
            </div>
            {/* Estilos para animação (podem ir para um arquivo CSS global ou styled-components) */}
            <style jsx global>{`
                @keyframes modal-appear {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-modal-appear {
                    animation: modal-appear 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default Modal;

