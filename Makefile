.PHONY: setup run test
setup:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
run:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1
test:
	python -m pytest backend/tests -q
