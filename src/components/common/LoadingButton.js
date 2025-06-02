import React from 'react';
import LoadingSpinner from './LoadingSpinner'; // Assuming LoadingSpinner is in the same directory

/**
 * Componente de botão que exibe um spinner de carregamento quando loading={true}.
 * @param {object} props
 * @param {boolean} props.loading - Indica se o estado de carregamento está ativo.
 * @param {React.ReactNode} props.children - Conteúdo do botão (texto).
 * @param {string} [props.className] - Classes CSS adicionais para o botão.
 * @param {object} [props.rest] - Outras props HTML válidas para o elemento button (e.g., type, onClick, disabled).
 */
const LoadingButton = ({ loading, children, className = '', ...rest }) => {
    return (
        <button
            className={`flex items-center justify-center ${className}`}
            disabled={loading || rest.disabled} // Disable if loading or explicitly disabled
            {...rest} // Spread other props like type, onClick
        >
            {loading ? (
                <>
                    <LoadingSpinner size="4" color="white" />
                    <span className="ml-2">Processando...</span>
                </>
            ) : (
                children
            )}
        </button>
    );
};

export default LoadingButton;

