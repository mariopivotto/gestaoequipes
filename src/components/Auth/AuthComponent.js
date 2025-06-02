import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase'; // Importa a instância auth
import { LOGO_URL } from '../../utils/constants'; // Importa a URL do logo

const AuthComponent = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true); // Controla se é tela de login ou registro
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                // O onAuthStateChanged no GlobalProvider cuidará de atualizar o estado
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                // O onAuthStateChanged no GlobalProvider cuidará de atualizar o estado
            }
        } catch (err) {
            console.error("Erro de autenticação:", err);
            // Mapeia códigos de erro comuns para mensagens amigáveis
            switch (err.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    setError('Email ou senha inválidos.');
                    break;
                case 'auth/email-already-in-use':
                    setError('Este email já está em uso.');
                    break;
                case 'auth/weak-password':
                    setError('A senha deve ter pelo menos 6 caracteres.');
                    break;
                case 'auth/invalid-email':
                    setError('Formato de email inválido.');
                    break;
                default:
                    setError('Falha na autenticação. Verifique suas credenciais ou tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-white to-green-100 p-4">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-500 hover:scale-105">
                <img src={LOGO_URL} alt="Logo" className="mx-auto h-16 w-auto mb-6" onError={(e) => e.target.style.display='none'}/>
                <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-800 mb-6">
                    {isLogin ? 'Acessar Sistema' : 'Criar Conta'}
                </h2>
                <form onSubmit={handleAuth} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="seuemail@exemplo.com"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                            placeholder="******"
                        />
                    </div>
                    {error && (
                        <p className="text-red-600 text-sm text-center bg-red-100 p-2 rounded-md">{error}</p>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3 px-4 text-white font-semibold rounded-lg shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'}`}
                    >
                        {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Registrar')}
                    </button>
                </form>
                <p className="mt-6 text-center text-sm text-gray-600">
                    {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }} // Limpa erro ao trocar
                        className="ml-1 font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline transition duration-150 ease-in-out"
                    >
                        {isLogin ? 'Registre-se' : 'Faça login'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AuthComponent;

