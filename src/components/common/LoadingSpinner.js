import React from 'react';

/**
 * Componente simples de spinner de carregamento.
 */
const LoadingSpinner = ({ size = '8', color = 'blue-600' }) => {
    const sizeClass = `h-${size} w-${size}`;
    const colorClass = `border-${color}`;

    return (
        <div className="flex justify-center items-center">
            <div
                className={`animate-spin rounded-full ${sizeClass} border-t-2 border-b-2 ${colorClass}`}
                role="status"
                aria-live="polite"
                aria-label="Carregando"
            >
                <span className="sr-only">Carregando...</span>
            </div>
        </div>
    );
};

export default LoadingSpinner;

