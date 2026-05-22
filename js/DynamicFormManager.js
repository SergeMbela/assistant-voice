/**
 * AksantiNet - Dynamic Form Engine (Logic Only)
 * Génère du HTML sémantique sans classes CSS hardcodées,
 * prêt à être stylisé par Tailwind, Bootstrap ou CSS personnalisé.
 */
export class DynamicFormManager {
    constructor(containerOrId, options = {}) {
        this.container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;

        this.options = {
            baseUrl: options.baseUrl || '',
            externalApiUrl: options.externalApiUrl || '',
            apiKey: options.apiKey || '', // Ajout du support de l'API Key
            onStateChange: options.onStateChange || null,
            onSubmit: options.onSubmit || null,
            onFieldAdd: options.onFieldAdd || null,
            minAutocompleteLength: options.minAutocompleteLength || 3,
            autocompleteDebounceMs: options.autocompleteDebounceMs || 300,
            ...options
        };

        this.formState = {};
        this.autocompleteAbortController = null;
        this._activeAutocompleteListbox = null;
        this._activeAutocompleteInput = null;
        this._boundDocClick = this._handleDocumentClick.bind(this);
        document.addEventListener('click', this._boundDocClick);
    }

    /**
     * Rendu principal du formulaire à partir du JSON MedGemma
     */
    render(schema) {
        if (!this.container) {
            console.error('DynamicFormManager: Container not found');
            return;
        }
        this.container.innerHTML = '';
        this.formState = {};

        if (!Array.isArray(schema)) {
            console.error('DynamicFormManager: schema must be an array of sections');
            return;
        }

        schema.forEach(section => {
            const sectionEl = this.createSection(section);
            this.container.appendChild(sectionEl);
        });
    }

    createSection(section) {
        const sectionEl = document.createElement('section');
        sectionEl.id = `section-${section.id}`;

        if (section.label) {
            const title = document.createElement('h3');
            title.textContent = section.label;
            sectionEl.appendChild(title);
        }

        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'fields-container';
        fieldsContainer.dataset.sectionId = section.id;

        if (section.fields && Array.isArray(section.fields)) {
            section.fields.forEach(field => {
                const fieldEl = this.createField(field, section.id);
                fieldsContainer.appendChild(fieldEl);
            });
        }

        sectionEl.appendChild(fieldsContainer);
        return sectionEl;
    }

    /**
     * Générateur de champs par type
     */
    createField(field, sectionId) {
        const wrapper = document.createElement('div');
        wrapper.dataset.fieldId = field.id;
        wrapper.dataset.fieldType = field.type;
        wrapper.dataset.sectionId = sectionId;

        const labelText = field.label || '';

        switch (field.type) {
            case 'checkbox':
                this._createCheckboxField(field, wrapper, labelText);
                break;
            case 'autocomplete':
                this._createAutocompleteField(field, wrapper, labelText, sectionId);
                break;
            case 'textarea':
                this._createTextareaField(field, wrapper, labelText);
                break;
            case 'select':
                this._createSelectField(field, wrapper, labelText);
                break;
            case 'number':
                this._createNumberField(field, wrapper, labelText);
                break;
            case 'alert':
                this._createAlertField(field, wrapper, labelText);
                break;
            case 'pictogram_card':
                this._createPictogramField(field, wrapper, labelText);
                break;
            case 'range':
                this._createRangeField(field, wrapper, labelText);
                break;
            case 'text':
            default:
                this._createTextField(field, wrapper, labelText);
                break;
        }

        // Gestion de la répétitivité (ex: pour ajouter plusieurs codes CIM10)
        if (field.repeatable) {
            this._addRepeatButton(field, wrapper, sectionId);
        }

        return wrapper;
    }

    _addRepeatButton(field, wrapper, sectionId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-repeat';
        btn.innerHTML = '<span>+</span> Ajouter un autre';
        btn.style.marginTop = '8px';
        btn.style.fontSize = '0.8rem';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '5px';
        btn.style.cursor = 'pointer';
        btn.style.background = 'transparent';
        btn.style.border = '1px dashed var(--primary, #175b62)';
        btn.style.color = 'var(--primary, #175b62)';
        btn.style.padding = '4px 12px';
        btn.style.borderRadius = '15px';

        btn.onclick = () => {
            const newId = `${field.id}_${Date.now()}`;
            const newField = { ...field, id: newId, value: '', label: '', repeatable: false };
            const newFieldEl = this.createField(newField, sectionId);
            newFieldEl.style.marginTop = '8px';
            
            // On ajoute un bouton de suppression pour le nouveau champ
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.className = 'btn-remove-field';
            removeBtn.style.marginLeft = '10px';
            removeBtn.style.color = 'red';
            removeBtn.style.border = 'none';
            removeBtn.style.background = 'transparent';
            removeBtn.style.cursor = 'pointer';
            removeBtn.onclick = () => {
                newFieldEl.remove();
                delete this.formState[newId];
            };
            
            // On cherche le label ou l'input pour y accoler la croix
            const input = newFieldEl.querySelector('input, select, textarea');
            if (input) {
                input.style.width = 'calc(100% - 30px)';
                input.style.display = 'inline-block';
                input.after(removeBtn);
            }

            btn.before(newFieldEl);
        };

        wrapper.appendChild(btn);
    }

    _createCheckboxField(field, wrapper, labelText) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = field.id;
        cb.name = field.id;
        cb.checked = field.value || false;

        const label = document.createElement('label');
        label.htmlFor = field.id;
        label.appendChild(document.createTextNode(labelText));

        if (field.meta && field.meta.description) {
            const info = document.createElement('span');
            info.className = 'field-tooltip';
            info.title = field.meta.description;
            info.textContent = ' [?]';
            info.setAttribute('role', 'button');
            info.setAttribute('tabindex', '0');
            info.setAttribute('aria-label', `Info: ${field.meta.description}`);
            label.appendChild(info);
        }

        wrapper.appendChild(cb);
        wrapper.appendChild(label);

        cb.addEventListener('change', (e) => {
            this.updateState(field.id, e.target.checked);
        });

        this.formState[field.id] = cb.checked;
    }

    _createAutocompleteField(field, wrapper, labelText, sectionId) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.id = field.id;
        input.name = field.id;
        input.placeholder = field.placeholder || 'Rechercher...';
        input.autocomplete = 'off';
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', `${field.id}-suggestions`);

        const listbox = document.createElement('ul');
        listbox.id = `${field.id}-suggestions`;
        listbox.setAttribute('role', 'listbox');
        listbox.hidden = true;

        wrapper.appendChild(input);
        wrapper.appendChild(listbox);

        let debounceTimer;
        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.handleAutocomplete(e, field, sectionId, listbox);
            }, this.options.autocompleteDebounceMs);
        });

        input.addEventListener('keydown', (e) => {
            this.handleAutocompleteNavigation(e, listbox);
        });

        input.addEventListener('focus', () => {
            this._activeAutocompleteListbox = listbox;
            this._activeAutocompleteInput = input;
        });
    }

    _createTextareaField(field, wrapper, labelText) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const area = document.createElement('textarea');
        area.id = field.id;
        area.name = field.id;
        area.value = field.value || '';
        area.placeholder = field.placeholder || '';

        if (field.meta && field.meta.rows) {
            area.rows = field.meta.rows;
        }

        wrapper.appendChild(area);

        area.addEventListener('input', (e) => {
            this.updateState(field.id, e.target.value);
        });

        this.formState[field.id] = area.value;
    }

    _createSelectField(field, wrapper, labelText) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const select = document.createElement('select');
        select.id = field.id;
        select.name = field.id;

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = field.placeholder || '-- Sélectionner --';
        select.appendChild(defaultOpt);

        if (field.options && Array.isArray(field.options)) {
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value !== undefined ? opt.value : opt;
                option.textContent = opt.label !== undefined ? opt.label : opt;
                if (field.value !== undefined && String(option.value) === String(field.value)) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }

        wrapper.appendChild(select);

        select.addEventListener('change', (e) => {
            this.updateState(field.id, e.target.value);
        });

        this.formState[field.id] = select.value;
    }

    _createNumberField(field, wrapper, labelText) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const input = document.createElement('input');
        input.type = 'number';
        input.id = field.id;
        input.name = field.id;
        input.value = field.value !== undefined && field.value !== null ? field.value : '';
        input.placeholder = field.placeholder || '';

        if (field.meta) {
            if (field.meta.min !== undefined) input.min = field.meta.min;
            if (field.meta.max !== undefined) input.max = field.meta.max;
            if (field.meta.step !== undefined) input.step = field.meta.step;
        }

        wrapper.appendChild(input);

        input.addEventListener('input', (e) => {
            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
            this.updateState(field.id, val);
        });

        this.formState[field.id] = input.value === '' ? '' : parseFloat(input.value);
    }

    _createTextField(field, wrapper, labelText) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.id = field.id;
        input.name = field.id;
        input.value = field.value || '';
        input.placeholder = field.placeholder || '';

        wrapper.appendChild(input);

        input.addEventListener('input', (e) => {
            this.updateState(field.id, e.target.value);
        });

        this.formState[field.id] = input.value;
    }

    _createAlertField(field, wrapper, labelText) {
        const alertEl = document.createElement('div');
        alertEl.setAttribute('role', 'alert');
        if (field.severity) {
            alertEl.dataset.severity = field.severity;
        }

        if (labelText) {
            const strong = document.createElement('strong');
            strong.textContent = labelText;
            alertEl.appendChild(strong);
        }

        if (field.value) {
            const msg = document.createElement('p');
            msg.textContent = field.value;
            alertEl.appendChild(msg);
        }

        wrapper.appendChild(alertEl);
        this.formState[field.id] = field.value || '';
    }

    _createPictogramField(field, wrapper, labelText) {
        const card = document.createElement('article');
        card.dataset.cardType = 'pictogram';

        if (labelText) {
            const title = document.createElement('h4');
            title.textContent = labelText;
            card.appendChild(title);
        }

        if (field.value) {
            const vis = document.createElement('div');
            vis.className = 'pictogram-visual';
            vis.textContent = field.value;
            card.appendChild(vis);
        }

        if (field.meta) {
            const meta = field.meta;
            const details = document.createElement('div');
            details.className = 'pictogram-details';

            if (meta.dose_texte) {
                const dose = document.createElement('span');
                dose.className = 'pictogram-dose';
                dose.textContent = meta.dose_texte;
                details.appendChild(dose);
            }
            if (meta.duree) {
                const dur = document.createElement('span');
                dur.className = 'pictogram-duration';
                dur.textContent = meta.duree;
                details.appendChild(dur);
            }
            if (meta.instruction_repas) {
                const meal = document.createElement('span');
                meal.className = 'pictogram-meal';
                meal.textContent = meta.instruction_repas;
                details.appendChild(meal);
            }
            if (meta.urgence) {
                card.dataset.urgency = meta.urgence ? 'true' : 'false';
            }
            if (meta.moments && Array.isArray(meta.moments)) {
                const momentsList = document.createElement('ul');
                momentsList.className = 'pictogram-moments';
                meta.moments.forEach(m => {
                    const li = document.createElement('li');
                    li.textContent = m.label || m.visuel || m.moment;
                    if (m.icone) {
                        li.dataset.icon = m.icone;
                    }
                    momentsList.appendChild(li);
                });
                details.appendChild(momentsList);
            }

            card.appendChild(details);
        }

        wrapper.appendChild(card);
        this.formState[field.id] = field.value || '';
    }

    _createRangeField(field, wrapper, labelText) {
        if (labelText) {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        const rangeWrap = document.createElement('div');
        rangeWrap.className = 'range-field';

        const input = document.createElement('input');
        input.type = 'range';
        input.id = field.id;
        input.name = field.id;
        input.value = field.value !== undefined ? field.value : 50;
        if (field.meta) {
            if (field.meta.min !== undefined) input.min = field.meta.min;
            if (field.meta.max !== undefined) input.max = field.meta.max;
            if (field.meta.step !== undefined) input.step = field.meta.step;
        }
        if (field.readonly) {
            input.disabled = true;
            input.setAttribute('aria-readonly', 'true');
        }

        const valDisplay = document.createElement('output');
        valDisplay.htmlFor = field.id;
        valDisplay.textContent = input.value;

        input.addEventListener('input', (e) => {
            valDisplay.textContent = e.target.value;
            this.updateState(field.id, parseFloat(e.target.value));
        });

        rangeWrap.appendChild(input);
        rangeWrap.appendChild(valDisplay);
        wrapper.appendChild(rangeWrap);

        this.formState[field.id] = parseFloat(input.value);
    }

    /**
     * Logique d'auto-complétion pour ajouter des champs à la volée
     */
    async handleAutocomplete(event, field, sectionId, listbox) {
        const query = event.target.value.trim();
        if (query.length < this.options.minAutocompleteLength) {
            listbox.hidden = true;
            listbox.innerHTML = '';
            return;
        }

        if (this.autocompleteAbortController) {
            this.autocompleteAbortController.abort();
        }
        this.autocompleteAbortController = new AbortController();

        try {
            const separator = field.source.includes('?') ? '&' : '?';
            const headers = { 'Content-Type': 'application/json' };
            if (this.options.apiKey) {
                headers['X-API-Key'] = this.options.apiKey;
            }

            const baseUrl = this.options.baseUrl || '';
            const response = await fetch(
                `${baseUrl}${field.source}${separator}q=${encodeURIComponent(query)}`,
                { 
                    signal: this.autocompleteAbortController.signal,
                    headers: headers
                }
            );
            const results = await response.json();

            // Affichage des résultats sous forme de JSON brut dans le conteneur technique de l'application
            const vectorContent = document.getElementById('vector-json-content');
            const vectorContainer = document.getElementById('vector-json-container');
            if (vectorContent && vectorContainer) {
                vectorContent.textContent = JSON.stringify(results, null, 2);
                vectorContainer.classList.remove('hidden');
            }

            this.renderAutocompleteResults(results, listbox, event.target, field, sectionId);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Erreur autocomplete:', err);
            }
        }
    }

    renderAutocompleteResults(results, listbox, input, field, sectionId) {
        listbox.innerHTML = '';

        if (!results || !results.length) {
            listbox.hidden = true;
            return;
        }

        results.forEach((item, index) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.setAttribute('tabindex', '-1');
            li.dataset.index = index;

            // Formater le texte d'affichage: [code] label
            let displayText = '';
            const code = item.loinc || item.code || item.id;
            const label = item.label || item.name || item.text;

            if (code && label) {
                // Si le label contient déjà le code, on ne le répète pas
                displayText = label.includes(code) ? label : `[${code}] ${label}`;
            } else {
                displayText = label || code || (typeof item === 'string' ? item : JSON.stringify(item));
            }

            li.textContent = displayText;

            li.addEventListener('click', () => {
                input.value = displayText;
                listbox.hidden = true;
                
                // On passe l'objet formaté à addNewFieldToSection
                const formattedItem = { ...item, label: displayText };
                this.addNewFieldToSection(formattedItem, sectionId);
            });

            listbox.appendChild(li);
        });

        listbox.hidden = false;
    }

    handleAutocompleteNavigation(event, listbox) {
        if (listbox.hidden) return;

        const items = listbox.querySelectorAll('li[role="option"]');
        const active = listbox.querySelector('li[aria-selected="true"]');

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = active ? active.nextElementSibling : items[0];
            if (next) this.setActiveAutocompleteItem(active, next);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = active ? active.previousElementSibling : items[items.length - 1];
            if (prev) this.setActiveAutocompleteItem(active, prev);
        } else if (event.key === 'Escape') {
            listbox.hidden = true;
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (active) active.click();
        }
    }

    setActiveAutocompleteItem(current, next) {
        if (current) {
            current.removeAttribute('aria-selected');
            current.classList.remove('active');
        }
        next.setAttribute('aria-selected', 'true');
        next.classList.add('active');
        next.focus();
    }

    _handleDocumentClick(event) {
        if (
            this._activeAutocompleteListbox &&
            !this._activeAutocompleteListbox.hidden &&
            this._activeAutocompleteInput &&
            !this._activeAutocompleteInput.contains(event.target) &&
            !this._activeAutocompleteListbox.contains(event.target)
        ) {
            this._activeAutocompleteListbox.hidden = true;
        }
    }

    /**
     * Ajoute un nouveau champ dynamiquement (ex: un nouveau code CIM-10 ou LOINC choisi)
     */
    addNewFieldToSection(item, sectionId) {
        const sectionContainer = this.container.querySelector(
            `#section-${sectionId} .fields-container`
        );
        if (!sectionContainer) return;

        const newField = {
            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            label: item.label || item.name,
            type: item.type || 'checkbox',
            value: item.value !== undefined ? item.value : true,
            meta: item.meta || item
        };

        const fieldEl = this.createField(newField, sectionId);
        sectionContainer.appendChild(fieldEl);

        if (typeof this.options.onFieldAdd === 'function') {
            this.options.onFieldAdd(newField, sectionId, fieldEl);
        }

        fieldEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    updateState(fieldId, value) {
        this.formState[fieldId] = value;
        if (typeof this.options.onStateChange === 'function') {
            this.options.onStateChange(fieldId, value, { ...this.formState });
        }
    }

    /**
     * Collecte toutes les données du formulaire
     */
    collectData() {
        const data = {
            timestamp: new Date().toISOString(),
            fields: []
        };

        // Collect checkboxes
        this.container.querySelectorAll('input[type="checkbox"]').forEach(input => {
            const wrapper = input.closest('[data-field-id]');
            const labelEl = this.container.querySelector(`label[for="${input.id}"]`);
            data.fields.push({
                id: input.id || input.name,
                type: 'checkbox',
                value: input.checked,
                label: labelEl ? labelEl.textContent.replace(' [?]', '').trim() : '',
                section_id: wrapper ? wrapper.dataset.sectionId : ''
            });
        });

        // Collect text inputs
        this.container.querySelectorAll('input[type="text"]').forEach(input => {
            if (!input.id && !input.name) return;
            const wrapper = input.closest('[data-field-id]');
            const labelEl = this.container.querySelector(`label[for="${input.id}"]`);
            data.fields.push({
                id: input.id || input.name,
                type: 'text',
                value: input.value,
                label: labelEl ? labelEl.textContent.trim() : '',
                section_id: wrapper ? wrapper.dataset.sectionId : ''
            });
        });

        // Collect number inputs
        this.container.querySelectorAll('input[type="number"]').forEach(input => {
            if (!input.id && !input.name) return;
            const wrapper = input.closest('[data-field-id]');
            const labelEl = this.container.querySelector(`label[for="${input.id}"]`);
            data.fields.push({
                id: input.id || input.name,
                type: 'number',
                value: input.value === '' ? '' : parseFloat(input.value),
                label: labelEl ? labelEl.textContent.trim() : '',
                section_id: wrapper ? wrapper.dataset.sectionId : ''
            });
        });

        // Collect textareas
        this.container.querySelectorAll('textarea').forEach(textarea => {
            if (!textarea.id && !textarea.name) return;
            const wrapper = textarea.closest('[data-field-id]');
            const labelEl = this.container.querySelector(`label[for="${textarea.id}"]`);
            data.fields.push({
                id: textarea.id || textarea.name,
                type: 'textarea',
                value: textarea.value,
                label: labelEl ? labelEl.textContent.trim() : '',
                section_id: wrapper ? wrapper.dataset.sectionId : ''
            });
        });

        // Collect selects
        this.container.querySelectorAll('select').forEach(select => {
            if (!select.id && !select.name) return;
            const wrapper = select.closest('[data-field-id]');
            const labelEl = this.container.querySelector(`label[for="${select.id}"]`);
            data.fields.push({
                id: select.id || select.name,
                type: 'select',
                value: select.value,
                label: labelEl ? labelEl.textContent.trim() : '',
                section_id: wrapper ? wrapper.dataset.sectionId : ''
            });
        });

        return data;
    }

    getState() {
        return { ...this.formState };
    }

    setState(partialState) {
        Object.entries(partialState).forEach(([fieldId, value]) => {
            const input = this.container.querySelector(`[id="${fieldId}"], [name="${fieldId}"]`);
            if (!input) return;

            if (input.type === 'checkbox') {
                input.checked = !!value;
            } else if (input.tagName === 'SELECT') {
                input.value = value !== undefined ? String(value) : '';
            } else {
                input.value = value !== undefined && value !== null ? value : '';
            }
            this.formState[fieldId] = value;
        });
    }

    reset() {
        this.container.innerHTML = '';
        this.formState = {};
    }

    /**
     * Envoi à l'API externe ou via le callback onSubmit
     */
    async submit() {
        const payload = this.collectData();

        if (typeof this.options.onSubmit === 'function') {
            const result = this.options.onSubmit(payload);
            if (result instanceof Promise) return await result;
            return result;
        }

        if (!this.options.externalApiUrl) {
            console.warn('DynamicFormManager: No externalApiUrl or onSubmit handler configured');
            return null;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.options.apiKey) {
                headers['X-API-Key'] = this.options.apiKey;
            }

            const baseUrl = this.options.baseUrl || '';
            const url = this.options.externalApiUrl.startsWith('http') ? this.options.externalApiUrl : `${baseUrl}${this.options.externalApiUrl}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (err) {
            console.error('Erreur lors de l\'envoi externe:', err);
            throw err;
        }
    }

    destroy() {
        this.reset();
        document.removeEventListener('click', this._boundDocClick);
        if (this.autocompleteAbortController) {
            this.autocompleteAbortController.abort();
        }
    }
}
