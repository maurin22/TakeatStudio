const { execFileSync } = require('node:child_process')
const path = require('node:path')

// Assinatura ad-hoc no macOS (gratuita, feita na própria máquina de build).
// Sem ela, Macs com chip Apple recusam abrir o app e mostram o diálogo
// "não é seguro / mover para o Lixo" sem opção de continuar: todo código
// arm64 precisa de assinatura, mesmo sem certificado pago da Apple.
exports.default = async function afterPack(context) {
	if (context.electronPlatformName !== 'darwin') return
	const appName = context.packager.appInfo.productFilename
	const appPath = path.join(context.appOutDir, `${appName}.app`)
	execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
	console.log(`[after-pack] assinatura ad-hoc aplicada: ${appPath}`)
}
